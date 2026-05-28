# Workflow State Projection + Prompt Rendering Proposal

## Status

- Slice: #89 State Projection + Prompt Rendering
- State: implemented in PR #94 for the generic workflow interpreter
- Scope boundary: generic workflow interpreter; no DevHarness-specific runtime semantics
- Implementation status: `render` CLI mode, state projection, prompt rendering, renderer-owned default prompt layering, and deterministic tests are present in this slice

## Problem

The workflow interpreter can identify the current `step` and return a directive, but the next boundary is still implicit: something must turn the current workflow step plus baton state into a ready prompt for a child worker or approval surface.

That boundary should be a deterministic prompt-rendering stage, not an orchestrator shortcut and not interpreter transition logic. The renderer compiles a prompt from:

- the current workflow `step`;
- optional step `input.template` and inline `input.prompt`;
- explicitly allowed baton state from `input.state`;
- role material from `input.role` when present, resolved from `roles/<name>/ROLE.md` and `roles/<name>/RUBRIC.md`;
- worker output instructions from `output.template` when present;
- optional JSON response constraints from `output.schema` when present.

The orchestrator then receives a compiled prompt plus launch metadata. It may launch a subagent later, but the renderer itself never chooses transitions, applies output, calls subagents, or knows DevHarness-specific behavior.

## Scope

In scope for #89:

- Define and implement a small deterministic state projection function.
- Define and implement a dumb workflow prompt renderer.
- Extend schemas only where needed to expose compiled prompt results cleanly.
- Add deterministic CLI/test coverage for rendering the current step.
- Keep output contracts based on `shared/templates` markdown templates using `output.template`, with optional local JSON schemas referenced by `output.schema` for prompt-level response constraints.

## Non-goals

- No dynamic fan-out/join.
- No dynamic reviewer routing.
- No fake end-to-end wrapper.
- No generic extraction from worker prose.
- No real subagent launch.
- No LLM/model/network tests.
- No compatibility layer for old workflow shapes.
- No DevHarness-specific interpreter branches.
- No `format`, `sections`, or runtime worker-output validation changes inside `output`; output contracts remain markdown templates referenced by `template`, with optional `schema` prompt injection only.

## Existing baseline to preserve

Current files already establish these contracts:

- `develop/dev-harness.workflow.json` declares worker and approval steps with `input.state`, optional `input.template`, optional `input.prompt`, optional worker `input.role`, and worker `output.template`.
- `develop/schemas/workflow.json` rejects step-level extension fields and allows workflow-scoped extensions only.
- `develop/lib/workflow/interpreter/index.mjs` chooses the current `step`, validates transition targets, applies output, and returns `{ baton, directive }` for `inspect`/`apply`; `render` adds `compiledPrompt` without changing those existing response shapes.
- `develop/lib/workflow/directive.mjs` exposes `{ id, action, step }` without rendering prompts.
- `develop/lib/workflow/projection.mjs` projects only explicit top-level `input.state` keys and fails on missing or nested selectors.
- `develop/lib/workflow/prompt-renderer.mjs` loads local markdown templates, assembles fallback prompts, appends omitted role/output/state/step-prompt/user-task/reminder sections in the compiled layer order, and returns prompt metadata plus opt-in diagnostics.
- `develop/lib/workflow/state.mjs` applies worker/approval output to baton state after the worker returns.
- `shared/templates/README.md` says shared templates are output templates and do not define orchestration or worker spawning.

## Contract

## Data model

### Workflow step fields

Use the existing step vocabulary and keep the field names simple:

```json
{
  "name": "Research",
  "kind": "worker",
  "input": {
    "role": "researcher",
    "state": ["artifacts", "results"],
    "prompt": "Read task context..."
  },
  "output": {
    "template": "../../shared/templates/research-packet-template.md"
  },
  "next": { "match": "${{ output.outcome }}", "cases": { "ready": "next_step" } }
}
```

Renderer-relevant fields:

| Field | Applies to | Meaning |
| --- | --- | --- |
| `step.name` | all step kinds | Human label available to prompt templates and default prompt text. |
| `step.kind` | all step kinds | Determines directive action outside the renderer and remains available to prompt templates. |
| `input.template` | all step kinds, optional | Markdown input prompt template to load and render; omitted steps use renderer-owned prompt layering. |
| `input.prompt` | all step kinds | Inline task instruction appended or substituted by the renderer. |
| `input.state` | all step kinds | Explicit list of baton `state` keys that may be projected. |
| `input.role` | worker | Role name resolved from `roles/<name>/`; renderer inlines `ROLE.md` and `RUBRIC.md` into prompt context. |
| `output.template` | worker | Markdown output contract template to include as strict return-shape instructions. |
| `output.schema` | worker, optional | Repository-local JSON schema file to inject near the output contract as concise valid-JSON/self-check instructions. |
| `workflow.instruction` | workflow root, optional extension | Workflow-level instruction appended directly under the top wrapper, before role/output/context layers. |
| `workflow.userTask` | workflow root, optional extension | Concrete user task/request appended near the bottom for recency after role, output contract, and projected state context. |

### `input.state`

`input.state` is an allow-list, not a hint. The renderer must project only the listed baton state keys. If `input.state` is absent or empty, no baton state is included.

V1 selectors are top-level baton state keys only:

- valid examples: `artifacts`, `results`, `attempts`;
- invalid examples: `artifacts[0]`, `artifacts.summary`, `results.*`, `$..summary`.

Nested path selection should not ship in v1. It creates a query language, partial-object privacy questions, ordering traps, and unclear diagnostics. If needed later, add a separate selector grammar after real use cases exist.

### Prompt template reference

`input.template` is resolved as a repository-local markdown file using the same consumer-relative convention already used by workflow descriptors. Dev Harness now omits the obsolete base input template and relies on renderer-owned prompt layering; explicit custom input templates remain separate from shared output templates.

Resolution must be deterministic and local-only:

1. resolve relative references against the workflow descriptor directory unless the caller passes an explicit template base directory;
2. reject paths outside the repository root or configured template roots;
3. reject missing files with a hard renderer error;
4. do not fetch templates from the network.

Do not silently ignore a declared `input.template`; missing declared templates fail clearly. Omitted templates use the deterministic default prompt and may emit opt-in diagnostics.

### Output contract references

`output.template` is a markdown output contract. The renderer loads the referenced markdown file and appends it as strict worker return instructions.

`output.schema` is optional prompt guidance. When present, the renderer resolves it with the same repository-root confinement rules as output templates, verifies the file is parseable JSON, and injects an instruction to return valid JSON matching that schema. When a validation command or tool is available in the agent/subagent context, the injected instruction requires preflight validation of the generated JSON against the schema before the final answer, fixing validation errors and repeating for a bounded number of attempts. The harness/orchestrator still validates the final returned JSON again after the answer, so agent-side validation is preflight, not the final authority. If no validation command or tool is available in that context, the agent should still return strict schema-matching JSON and expect harness-level validation. The renderer does not validate future worker output while rendering. The interpreter/harness validates the returned worker JSON against this schema during `apply`.

Rules:

- keep `template` as the existing markdown contract field;
- allow optional `schema` as a local JSON schema path;
- DevHarness may use `output.schema` on research and implementation-plan worker steps to require reviewer selection state such as `review_plan.reviewers`; this validates/stores the structured output only and does not implement reviewer routing or fan-out;
- reject missing, escaping, or invalid-JSON schema files with deterministic `WorkflowInterpreterError`;
- do not introduce `format`, `sections`, or similar output contract fields;
- do not validate returned markdown headings at render time;
- steps without `output.schema` keep worker-output envelope validation in the existing `worker-output` schema.


### Harness-side output schema validation

During `apply`, worker steps with `output.schema` use that schema as the authoritative validation gate for the returned JSON. The returned value must parse as JSON; non-JSON output is treated as a schema-validation failure for retry purposes. On a validation failure, the interpreter returns the same worker step again, increments `baton.state.attempts["<stepId>:output.schema"]`, and appends a compact deterministic validation-feedback prompt to the directive step input. After three failed attempts, `apply` fails with a deterministic `WorkflowInterpreterError`.

On success, every worker output is stored under `baton.state[stepId]` for later state projection. Validated structured JSON is also mirrored under legacy `baton.state.outputs[stepId]` for compatibility. `artifacts` and `results`, when present in the output, continue to merge into the existing top-level baton state. Steps without `output.schema` keep the previous worker-output envelope validation while still making the full envelope projectable by step id.

### Role material

`input.role` remains a string role name in workflow JSON, but the rendered prompt resolves that name to repository-local role material.

Renderer behavior:

- validate `input.role` as a role directory name (`A-Z`, `a-z`, `0-9`, `_`, `-`) and reject traversal or path-like values;
- resolve role files from `roles/<input.role>/ROLE.md` and `roles/<input.role>/RUBRIC.md` under the repository root;
- inline both files into the fixed `## Role material` section, with deterministic `<!-- role material: ... -->` source comments;
- append a `## Role material` section when `input.role` is present; input templates do not consume role variables;
- fail hard with a deterministic `WorkflowInterpreterError` when either required role material file is missing or escapes the repository root;
- do not infer capabilities, map roles to subagent agents, or make role required for worker steps unless a separate schema decision is approved.

### Compiled prompt result shape

Add a renderer-level result shape that can be embedded in a future directive or exposed by a CLI command:

```json
{
  "prompt": "...final rendered markdown...",
  "metadata": {
    "outputTemplate": "../../shared/templates/research-packet-template.md",
    "outputSchema": "schemas/research-output.schema.json",
    "roleMaterial": ["roles/researcher/ROLE.md", "roles/researcher/RUBRIC.md"],
    "projectedStateKeys": ["artifacts", "results"]
  }
}
```

Notes:

- `prompt` is the final string passed to the orchestrator.
- `metadata` is optional launch/support data only; it must not require orchestration decisions.
- `diagnostics` is optional and should only be emitted when the caller opts in and diagnostics are present. Hard failures should throw `WorkflowInterpreterError` or a sibling workflow renderer error and surface through CLI stderr.
- Avoid adding this to the existing `inspect` output by default unless Sergey approves response-shape expansion. A separate CLI mode avoids breaking the current directive contract. Keep debug step fields (`stepId`, `action`, `kind`, `name`) in `directive`, not duplicated in `compiledPrompt`.

## `projectState` behavior

Proposed signature:

```js
projectState({ batonState, selectors }) -> { value, projectedKeys, diagnostics }
```

### Selection

- Only keys named by `selectors` are copied from `baton.state`.
- Selector order is preserved from `input.state` after schema-level duplicate rejection.
- Absent or empty selectors produce `{}` with no projected keys.

### Missing-key policy

Default v1 policy: fail hard when a selected key is absent from `baton.state`.

Rationale: `input.state` is an explicit contract. A typo such as `artifact` should not produce a deceptively valid prompt.

Error shape should identify:

- `stepId`;
- selector;
- available top-level baton state keys.

Example message:

```text
workflow prompt render failed: step 'research' selected missing baton state key 'artifact'; available keys: artifacts, results
```

### Nested path policy

Reject nested selectors in v1. A selector is valid only when it matches one top-level key exactly. Suggested validation regex: `/^[A-Za-z_][A-Za-z0-9_-]*$/` plus actual key existence.

Rejected selector examples should produce clear diagnostics:

```text
workflow prompt render failed: step 'research' uses unsupported state selector 'artifacts.0'; v1 supports top-level baton state keys only
```

### Serialization

State projection inserted into prompts should be serialized as fenced JSON:

````markdown
## Projected baton state

```json
{
  "artifacts": [],
  "results": []
}
```
````

Serialization rules:

- use `JSON.stringify(value, null, 2)`;
- preserve selected key order in the object insertion order;
- preserve array order from baton state;
- do not redact, summarize, truncate, or normalize in v1;
- add a trailing newline after the fenced block for stable snapshots.

If truncation/redaction becomes necessary later, make it a separate explicit projection policy. Do not hide it inside the dumb renderer.

## `renderWorkflowPrompt` behavior

Proposed signature:

```js
renderWorkflowPrompt({ workflowPath, workflow, baton, stepId, step, repositoryRoot, templateBaseDir }) -> compiledPrompt
```

### Inputs

The renderer receives already-validated workflow/baton/step data. It may be called by `inspect`-adjacent code after `loadWorkflowAndBaton`, but it must not call `resolveTransition` or `applyOutputToBatonState`.

### Template resolution

- Load `input.template` when present.
- Load `output.template` when present.
- Load and parse-check `output.schema` when present.
- Resolve relative paths deterministically and reject missing or unsafe paths.
- Do not resolve templates from package registries, URLs, or model output.
- Keep input templates and shared output templates separate.

### Placeholder policy

Input template variables are unsupported in this slice. The renderer does not expand `{{...}}` values for custom templates. If a declared `input.template` contains a `{{...}}` token, rendering fails clearly instead of passing through a confusing half-rendered prompt.

Rationale: current workflow prompts only need fixed layering. Placeholder expansion would turn prompt rendering into a mini templating language before there is a concrete need for it.

### Prompt assembly

If `input.template` exists, the renderer uses it only as static top-level markdown. No variables are expanded. Omitted templates use a deterministic default top-level wrapper:

```markdown
# <step.name>
```

After that top layer, the renderer always concatenates fixed sections in this order when each source exists:

1. `## Workflow instruction` from workflow-level instruction text;
2. `## Role material` if `input.role` exists;
3. `## Output contract` if `output.template` exists;
4. `## Projected baton state` if `input.state` selected anything;
5. `## Workflow step prompt` if `input.prompt` exists;
6. `## Concrete user task` from workflow-level user task fields;
7. final reminder when an output contract exists.

This keeps the output contract high for primacy, places context before the executable step/user request, and keeps a short output-contract reminder at the bottom for recency. It intentionally does not preserve compatibility with older placeholder templates.

### Output rules inclusion

Output contract section format:

```markdown
## Output contract

Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.

<!-- output template: ../../shared/templates/research-packet-template.md -->

<template contents>
```

The envelope remains the existing worker/approval output JSON contract (`outcome` or `approval`, optional `artifacts`, `results`, `blocker`). The markdown template describes artifact content expected from the child, not a JSON schema.

### Unsupported placeholder policy

Fail hard when static input template markdown contains `{{...}}`.

Rationale: placeholders are not part of the renderer contract. Silent leftovers produce confusing child prompts, and supported variables are unnecessary for the current fixed-layer prompt assembly.

Error should include:

- template path;
- unsupported placeholder token.

### Deterministic formatting

- Normalize loaded template line endings to `\n`.
- Trim exactly one trailing newline from loaded templates before inserting them.
- Emit final prompt with one trailing newline.
- Use stable section headings.
- Do not include timestamps, absolute machine paths, random IDs, model names, or environment-dependent content in prompts.

## Orchestrator boundary

Renderer output is the full prompt plus metadata only.

Renderer must not:

- choose the next step;
- inspect transition maps except to include existing metadata if explicitly approved later;
- apply worker output to baton;
- call subagents or models;
- load DevHarness skill-specific role instructions;
- decide worker count, reviewer routing, fan-out, retries, approval state, or terminal handling, even when a structured output declares desired reviewer selection.

Interpreter remains responsible for current-step selection and post-output transitions. Orchestrator remains responsible for launching or not launching workers. Renderer is the pure compiler between those two boundaries.

## CLI and test surface

Preferred CLI surface: add a new mode beside `inspect` and `apply`:

```bash
node develop/scripts/workflow-interpreter.mjs render [--diagnostics] <workflow.json> <baton.json>
```

Output shape:

```json
{
  "baton": { "cursor": "research", "status": "running", "state": { "artifacts": [], "results": [] } },
  "directive": { "id": "research", "action": "run_worker", "step": { } },
  "compiledPrompt": { "prompt": "...", "metadata": { } }
}
```

Why a new command:

- keeps current `inspect` stable for existing tests and consumers;
- makes prompt compilation an explicit operator action;
- gives deterministic snapshot coverage without pretending to launch a worker.

Alternative, if Sergey wants fewer commands: support `inspect --render-prompt`. That is slightly more complicated with current positional CLI parsing and less clean for tests.

## Errors and diagnostics

Hard errors:

- workflow/baton schema validation failure;
- cursor/status inconsistency;
- selected missing baton state key;
- nested or unsupported state selector;
- missing `input.template` when declared;
- missing `output.template` when declared;
- invalid `input.role`, role material escape, or missing `roles/<name>/ROLE.md` / `roles/<name>/RUBRIC.md`;
- template path escapes allowed roots;
- declared input templates that contain unsupported `{{...}}` placeholders.

Non-errors:

- absent `input.template`: use deterministic default prompt;
- absent `input.prompt`: omit the workflow-step-prompt section;
- absent `input.state`: emit no state section;
- absent `output.template` on approval/done/blocked steps.

Diagnostics are machine-readable in compiled results only when rendering succeeds with non-fatal notices and the caller opts in, for example CLI `render --diagnostics`. The current non-fatal diagnostic is `default_prompt_used`, emitted when a step has no `input.template` and the renderer assembles the deterministic fallback prompt. Most v1 conditions still fail hard rather than continue with a risky prompt.

## Test plan

All tests deterministic; no LLM, model, network, or subagent calls.

Unit tests:

- `projectState` includes only explicit keys.
- `projectState` preserves selector order.
- `projectState` rejects missing keys.
- `projectState` rejects nested selectors.
- `projectState` serializes stable fenced JSON.
- `renderWorkflowPrompt` renders default prompt when no input template exists.
- `renderWorkflowPrompt` emits default-prompt diagnostics only when requested.
- `renderWorkflowPrompt` rejects unsupported placeholders in input templates.
- `renderWorkflowPrompt` appends role/output/state/workflow-step/user-task/reminder sections in fixed order.
- `renderWorkflowPrompt` keeps output contracts as static included contract text.
- `renderWorkflowPrompt` includes shared output template content without treating it as schema.
- path resolver rejects path escape and missing template references.

CLI/smoke tests:

- `render` on a minimal fixture returns `compiledPrompt.prompt` and does not mutate baton file.
- `render` on Dev Harness fixture succeeds through renderer-owned prompt layering and fails clearly if a declared input template is missing.
- `render --diagnostics` includes non-fatal diagnostics while plain `render` omits them.
- `inspect` output remains unchanged unless Sergey approves adding compiled prompt there.
- `apply` without `output.schema` behavior remains unchanged.
- `apply` stores each worker output under `baton.state[stepId]`, mirrors structured `output.schema` outputs under `baton.state.outputs[stepId]`, and keeps `artifacts`/`results` aggregation intact.
- `apply` with invalid structured output retries with validation feedback, then fails deterministically after the bounded attempt limit.

Schema tests:

- existing `output` only accepts `{ "template": "..." }`.
- `input.state` remains a unique string array.
- optional schema for compiled prompt response rejects extra top-level fields if a schema is added.

## Migration plan

Minimal migration path:

1. Add renderer modules under `develop/lib/workflow/`, likely:
   - `projection.mjs` for `projectState`;
   - `prompt-renderer.mjs` for static template loading and fixed-layer assembly;
   - optional `path-resolution.mjs` if shared with JSON/template IO.
2. Add a schema only if compiled prompt responses become part of the stable directive/response contract; this slice keeps `compiledPrompt` limited to `render` output.
3. Add `render` CLI mode without changing `inspect` output.
4. Remove the obsolete base input template reference from `develop/dev-harness.workflow.json` and rely on renderer-owned prompt layering unless a step declares a custom template.
5. Keep `output.template` unchanged and continue using `shared/templates`.
6. Do not change transition application or baton merge semantics.

## Blunt design critique

The main risk is overbuilding a workflow runtime before the boundary has paid for itself. Keep #89 boring.

Do not build:

- a template language;
- partial JSON querying;
- role loader or agent router;
- output parser;
- hidden state redaction/summarization;
- dynamic worker graph mechanics;
- DevHarness-specific prompt sections inside generic code.

The renderer should be easy to delete or replace: read static markdown, project explicit top-level state, append required sections, return a string. Anything smarter belongs either in workflow authoring, the orchestrator, or a later explicit slice.

Boundary pressure to watch:

- If renderer starts looking at `next`, it is becoming interpreter logic.
- If renderer starts choosing agents, it is becoming orchestrator logic.
- If renderer starts interpreting markdown output templates as schemas, it is violating #87.
- If renderer starts inferring state from baton instead of `input.state`, it is leaking context by default.
- If renderer accepts placeholders, it will become an undocumented programming language before there is a concrete need.

## Open questions for Sergey approval

1. CLI shape: PR #94 uses `render <workflow.json> <baton.json>` and leaves `inspect`/`apply` response shapes unchanged.
2. Missing declared input templates: PR #94 fails hard when a declared template is missing; Dev Harness no longer declares the removed base input template.
3. Compiled prompt location: PR #94 keeps `compiledPrompt` only in the new render response; future directive embedding remains a separate approval decision.
