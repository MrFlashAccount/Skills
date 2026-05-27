# Workflow State Projection + Prompt Rendering Proposal

## Status

- Slice: #89 State Projection + Prompt Rendering
- State: implemented in PR #94 for the generic workflow interpreter
- Scope boundary: generic workflow interpreter; no DevHarness-specific runtime semantics
- Implementation status: `render` CLI mode, state projection, prompt rendering, minimal DevHarness input templates, and deterministic tests are present in this slice

## Problem

The workflow interpreter can identify the current `step` and return a directive, but the next boundary is still implicit: something must turn the current workflow step plus baton state into a ready prompt for a child worker or approval surface.

That boundary should be a deterministic prompt-rendering stage, not an orchestrator shortcut and not interpreter transition logic. The renderer compiles a prompt from:

- the current workflow `step`;
- the step `input.template` and inline `input.prompt`;
- explicitly allowed baton state from `input.state`;
- role metadata from `input.role` when present;
- worker output instructions from `output.template` when present.

The orchestrator then receives a compiled prompt plus launch metadata. It may launch a subagent later, but the renderer itself never chooses transitions, applies output, calls subagents, or knows DevHarness-specific behavior.

## Scope

In scope for #89:

- Define and implement a small deterministic state projection function.
- Define and implement a dumb workflow prompt renderer.
- Extend schemas only where needed to expose compiled prompt results cleanly.
- Add deterministic CLI/test coverage for rendering the current step.
- Keep output contracts based on `shared/templates` markdown templates using `output.template` only.

## Non-goals

- No dynamic fan-out/join.
- No dynamic reviewer routing.
- No fake end-to-end wrapper.
- No generic extraction from worker prose.
- No real subagent launch.
- No LLM/model/network tests.
- No compatibility layer for old workflow shapes.
- No DevHarness-specific interpreter branches.
- No JSON schema or `format` fields inside `output`; output contracts remain markdown templates referenced by `template`.

## Existing baseline to preserve

Current files already establish these contracts:

- `develop/dev-harness.workflow.json` declares worker and approval steps with `input.state`, optional `input.template`, optional `input.prompt`, optional worker `input.role`, and worker `output.template`.
- `develop/templates/dev-harness/*.md` provides minimal workflow-local input prompt templates for the current Dev Harness worker steps.
- `develop/schemas/workflow.json` rejects step-level extension fields and allows workflow-scoped extensions only.
- `develop/lib/workflow/interpreter.mjs` chooses the current `step`, validates transition targets, applies output, and returns `{ baton, directive }` for `inspect`/`apply`; `render` adds `compiledPrompt` without changing those existing response shapes.
- `develop/lib/workflow/directive.mjs` exposes `{ id, action, step }` without rendering prompts.
- `develop/lib/workflow/projection.mjs` projects only explicit top-level `input.state` keys and fails on missing or nested selectors.
- `develop/lib/workflow/prompt-renderer.mjs` loads local markdown templates, assembles fallback prompts, appends omitted task/state/output sections, and returns prompt metadata plus diagnostics.
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
    "template": "templates/dev-harness/research.md",
    "role": "researcher",
    "state": ["artifacts", "results"],
    "prompt": "Read task context..."
  },
  "output": {
    "template": "../../shared/templates/research-packet-template.md"
  },
  "next": { "by": "outcome", "map": { "ready": "next_step" } }
}
```

Renderer-relevant fields:

| Field | Applies to | Meaning |
| --- | --- | --- |
| `step.name` | all step kinds | Human label included as metadata and optional prompt text. |
| `step.kind` | all step kinds | Determines directive action outside the renderer; renderer only reports it. |
| `input.template` | worker, optional for approval/terminal | Markdown input prompt template to load and render. |
| `input.prompt` | all step kinds | Inline task instruction appended or substituted by the renderer. |
| `input.state` | all step kinds | Explicit list of baton `state` keys that may be projected. |
| `input.role` | worker | Role metadata for orchestrator launch and prompt context. No role file loading in v1. |
| `output.template` | worker | Markdown output contract template to include as strict return-shape instructions. |

### `input.state`

`input.state` is an allow-list, not a hint. The renderer must project only the listed baton state keys. If `input.state` is absent or empty, no baton state is included.

V1 selectors are top-level baton state keys only:

- valid examples: `artifacts`, `results`, `attempts`;
- invalid examples: `artifacts[0]`, `artifacts.summary`, `results.*`, `$..summary`.

Nested path selection should not ship in v1. It creates a query language, partial-object privacy questions, ordering traps, and unclear diagnostics. If needed later, add a separate selector grammar after real use cases exist.

### Prompt template reference

`input.template` is resolved as a repository-local markdown file using the same consumer-relative convention already used by workflow descriptors. For Dev Harness, this means workflow-local input templates such as `templates/dev-harness/research.md` remain separate from shared output templates.

Resolution must be deterministic and local-only:

1. resolve relative references against the workflow descriptor directory unless the caller passes an explicit template base directory;
2. reject paths outside the repository root or configured template roots;
3. reject missing files with a renderer diagnostic;
4. do not fetch templates from the network.

If current referenced input templates are intentionally not present yet, #89 should either add minimal markdown template files in the expected location or make missing-template diagnostics part of the smoke tests. Do not silently ignore missing `input.template`.

### Output template reference

`output.template` is an output contract, not an output schema. The renderer loads the referenced markdown file and appends it as strict worker return instructions.

Rules:

- use `template` only;
- do not introduce `schema`, `format`, `sections`, or similar output contract fields;
- do not validate returned markdown headings at render time;
- keep worker-output envelope validation in the existing `worker-output` schema.

### Role metadata

`input.role` remains a string metadata field in v1.

Renderer behavior:

- include `role` in the compiled prompt result metadata;
- include a small prompt line such as `Role: researcher` when present;
- do not load role files, infer capabilities, or map roles to subagent agents;
- do not make role required for worker steps unless a separate schema decision is approved.

### Compiled prompt result shape

Add a renderer-level result shape that can be embedded in a future directive or exposed by a CLI command:

```json
{
  "stepId": "research",
  "action": "run_worker",
  "kind": "worker",
  "name": "Research",
  "role": "researcher",
  "prompt": "...final rendered markdown...",
  "metadata": {
    "inputTemplate": "templates/dev-harness/research.md",
    "outputTemplate": "../../shared/templates/research-packet-template.md",
    "projectedStateKeys": ["artifacts", "results"]
  },
  "diagnostics": []
}
```

Notes:

- `prompt` is the final string passed to the orchestrator.
- `metadata` is launch/support data only; it must not require orchestration decisions.
- `diagnostics` should be empty on success. Hard failures should throw `WorkflowInterpreterError` or a sibling workflow renderer error and surface through CLI stderr.
- Avoid adding this to the existing `inspect` output by default unless Sergey approves response-shape expansion. A separate CLI mode avoids breaking the current directive contract.

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
- Resolve relative paths deterministically and reject missing or unsafe paths.
- Do not resolve templates from package registries, URLs, or model output.
- Keep input templates and shared output templates separate.

### Allowed placeholders

The template engine should be intentionally tiny. It reads markdown, replaces known placeholders, and fails on leftovers.

Allowed placeholders in `input.template`:

| Placeholder | Value |
| --- | --- |
| `{{step.id}}` | current step id |
| `{{step.name}}` | current step display name |
| `{{step.kind}}` | current step kind |
| `{{input.prompt}}` | inline prompt or empty string |
| `{{input.role}}` | role string or empty string |
| `{{state}}` | serialized projected baton state fenced block |
| `{{output.template}}` | rendered output contract section or empty string |

Do not add arbitrary object-path placeholders in v1. They quickly turn the renderer into a mini programming language.

### Prompt assembly

If `input.template` exists, the renderer uses it as the primary document and replaces placeholders.

If `input.template` is absent, assemble a deterministic default markdown prompt:

````markdown
# Workflow Step: <step.name>

Step id: <stepId>
Step kind: <step.kind>
Role: <input.role if present>

## Task

<input.prompt or "No inline prompt provided.">

## Projected baton state

```json
...
```

## Output contract

<contents of output.template, if present>
````

The renderer should append strict leftover sections when the template omits important content:

- append `## Task` if `input.prompt` exists and the rendered template did not consume `{{input.prompt}}`;
- append projected state if `input.state` selected anything and the rendered template did not consume `{{state}}`;
- append `## Output contract` if `output.template` exists and the rendered template did not consume `{{output.template}}`.

This keeps templates flexible without allowing silent omission of output rules or projected state.

### Output rules inclusion

Output contract section format:

```markdown
## Output contract

Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.

<!-- output template: ../../shared/templates/research-packet-template.md -->

<template contents>
```

The envelope remains the existing worker/approval output JSON contract (`outcome` or `approval`, optional `artifacts`, `results`, `blocker`). The markdown template describes artifact content expected from the child, not a JSON schema.

### Unresolved placeholder policy

Fail hard when rendered markdown still contains `{{...}}`.

Rationale: unresolved placeholders are almost always template bugs or stale docs. Silent leftovers produce confusing child prompts.

Error should include:

- `stepId`;
- template path;
- placeholder names;
- line numbers if cheap to compute.

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
- decide worker count, reviewer routing, fan-out, retries, approval state, or terminal handling.

Interpreter remains responsible for current-step selection and post-output transitions. Orchestrator remains responsible for launching or not launching workers. Renderer is the pure compiler between those two boundaries.

## CLI and test surface

Preferred CLI surface: add a new mode beside `inspect` and `apply`:

```bash
node develop/scripts/workflow-interpreter.mjs render <workflow.json> <baton.json>
```

Output shape:

```json
{
  "baton": { "cursor": "research", "status": "running", "state": { "artifacts": [], "results": [] } },
  "directive": { "id": "research", "action": "run_worker", "step": { } },
  "compiledPrompt": { "stepId": "research", "prompt": "...", "metadata": { }, "diagnostics": [] }
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
- template path escapes allowed roots;
- unresolved `{{...}}` placeholders after render.

Non-errors:

- absent `input.template`: use deterministic default prompt;
- absent `input.prompt`: emit a default task sentence if no template consumed it;
- absent `input.state`: emit no state section;
- absent `output.template` on approval/done/blocked steps.

Diagnostics are machine-readable in compiled results only when rendering succeeds with non-fatal notices. The current non-fatal diagnostic is `default_prompt_used`, emitted when a step has no `input.template` and the renderer assembles the deterministic fallback prompt. Most v1 conditions still fail hard rather than continue with a risky prompt.

## Test plan

All tests deterministic; no LLM, model, network, or subagent calls.

Unit tests:

- `projectState` includes only explicit keys.
- `projectState` preserves selector order.
- `projectState` rejects missing keys.
- `projectState` rejects nested selectors.
- `projectState` serializes stable fenced JSON.
- `renderWorkflowPrompt` renders default prompt when no input template exists.
- `renderWorkflowPrompt` replaces allowed placeholders.
- `renderWorkflowPrompt` appends task/state/output sections when template omits placeholders.
- `renderWorkflowPrompt` fails on unresolved placeholders.
- `renderWorkflowPrompt` includes shared output template content without treating it as schema.
- path resolver rejects path escape and missing template references.

CLI/smoke tests:

- `render` on a minimal fixture returns `compiledPrompt.prompt` and does not mutate baton file.
- `render` on Dev Harness fixture either succeeds after expected input templates are added or fails with the exact missing-template diagnostic chosen for #89.
- `inspect` output remains unchanged unless Sergey approves adding compiled prompt there.
- `apply` behavior remains unchanged.

Schema tests:

- existing `output` only accepts `{ "template": "..." }`.
- `input.state` remains a unique string array.
- optional schema for compiled prompt response rejects extra top-level fields if a schema is added.

## Migration plan

Minimal migration path:

1. Add renderer modules under `develop/lib/workflow/`, likely:
   - `projection.mjs` for `projectState`;
   - `prompt-renderer.mjs` for template loading/replacement/assembly;
   - optional `path-resolution.mjs` if shared with JSON/template IO.
2. Add a schema only if compiled prompt responses become part of the stable directive/response contract; this slice keeps `compiledPrompt` limited to `render` output.
3. Add `render` CLI mode without changing `inspect` output.
4. Add minimal input prompt templates referenced by `develop/dev-harness.workflow.json`.
5. Keep `output.template` unchanged and continue using `shared/templates`.
6. Do not change transition application or baton merge semantics.

If the referenced input templates are not supposed to be committed yet, #89 should not alter Dev Harness workflow references. Instead, fixtures should use local temp templates and Dev Harness smoke should assert a clear missing-template failure.

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

The renderer should be easy to delete or replace: read markdown, project explicit top-level state, replace known placeholders, append required sections, return a string. Anything smarter belongs either in workflow authoring, the orchestrator, or a later explicit slice.

Boundary pressure to watch:

- If renderer starts looking at `next`, it is becoming interpreter logic.
- If renderer starts choosing agents, it is becoming orchestrator logic.
- If renderer starts interpreting markdown output templates as schemas, it is violating #87.
- If renderer starts inferring state from baton instead of `input.state`, it is leaking context by default.
- If renderer accepts arbitrary placeholders, it will become an undocumented programming language.

## Open questions for Sergey approval

1. CLI shape: PR #94 uses `render <workflow.json> <baton.json>` and leaves `inspect`/`apply` response shapes unchanged.
2. Missing declared input templates: PR #94 adds minimal `develop/templates/dev-harness/*.md` files for the current workflow references and tests the Dev Harness render path.
3. Compiled prompt location: PR #94 keeps `compiledPrompt` only in the new render response; future directive embedding remains a separate approval decision.
