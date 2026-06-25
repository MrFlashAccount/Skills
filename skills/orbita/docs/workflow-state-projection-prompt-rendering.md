# Workflow State Projection + Prompt Rendering Contract

## Status

- PR: #108 research workflow JSON contract updates
- State: implemented in the v3 workflow runtime layers
- Scope boundary: generic workflow runtime; no DevHarness-specific runtime semantics
- Implementation status: entrypoints, persistence, use-cases, entities, DTOs, prompt rendering, output schema validation, and deterministic tests are present

## Problem

The v3 runtime identifies the current `Step` through the `Workflow` and `Baton` entities, then renders executable step instructions through `Step`/`Template` behavior coordinated by use-cases. The boundary is explicit: entrypoints and persistence own IO, use-cases coordinate runtime flow, entities own workflow/baton/step/template behavior, and DTOs carry boundary data.

Prompt rendering is deterministic runtime behavior, not an orchestrator shortcut and not transition logic. `Step` prepares render context and `Template` renders prompt text from:

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
- Keep output contracts as markdown templates using `output.template`: all workflow file refs are relative to the directory containing the active `workflow.json`. Reusable shared templates use normal relative paths such as `../../shared/templates/...`.

## Non-goals

- No dynamic fan-out/join.
- No dynamic reviewer routing.
- No fake end-to-end wrapper.
- No generic extraction from worker prose.
- No real subagent launch.
- No LLM/model/network tests.
- No compatibility layer for old workflow shapes.
- No DevHarness-specific runtime branches.
- No `format`, `sections`, or runtime worker-output validation changes inside `output`; output contracts remain markdown templates referenced by `template`, with optional `schema` prompt injection only.

## Current v3 ownership baseline

Current files establish these contracts:

- `./lib/entrypoints/` owns CLI/API parsing and host-facing response shape. It resolves run arguments, calls persistence, invokes use-cases, and returns instruction text or JSON responses.
- `./lib/persistence/` owns filesystem/resource IO: workflow files, baton/run-state files, instruction files, templates, output schemas, role material, durable commits, and host-request storage paths.
- `./lib/use-cases/` owns process orchestration across entities. `RunNext`, `ContinueRun`, `ApplyWorkflowOutput`, `LoadInstructions`, `ValidateWorkflow`, and `InspectWorkflow` receive DTO/raw boundary data, construct entities, call entity methods, and return boundary results without direct filesystem access.
- `./lib/file-contracts/workflow-document-schema.mjs` and `workflow-document.json` own the external workflow document/file contract.
- `./lib/entities/Workflow/index.mjs` owns workflow semantic validation, topology, step lookup, transition semantics, output schema semantics, and baton cursor inference.
- `./lib/entities/Baton/index.mjs` owns runtime state/cursor/status consistency, pending-output access, and safe state updates.
- `./lib/entities/Step/index.mjs` owns step-level input projection, transition descriptors, concrete target resolution, output application intent, instruction-request validation, and render-context preparation.
- `./lib/entities/Template/index.mjs` plus `./lib/entities/Template/compiler/**` own prompt/template rendering mechanics.
- `./lib/dtos/` owns boundary shapes only: workflow, baton/run-state, step, template, instruction, output, and workflow-result DTOs.
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
    "state": ["research_draft", "implementation_plan"],
    "prompt": "Read task context..."
  },
  "output": {
    "template": "templates/research-packet-template.md"
  },
  "next": { "match": "${{ output.outcome }}", "cases": { "ready": "next_step" } }
}
```

Renderer-relevant fields:

| Field | Applies to | Meaning |
| --- | --- | --- |
| `step.name` | all step kinds | Human label available to prompt templates and default prompt text. |
| `step.kind` | all step kinds | Determines directive action outside the renderer and remains available to prompt templates. |
| `input.template` | all step kinds, optional | Markdown input prompt template to load and render from the workflow package directory, or from `shared/...` when explicitly referenced; omitted steps use renderer-owned prompt layering. |
| `input.prompt` | all step kinds | Inline task instruction appended or substituted by the renderer. |
| `input.state` | all step kinds | Explicit list of workflow step ids whose state may be projected. |
| `input.role` | worker | Role name resolved from `roles/<name>/`; renderer inlines `ROLE.md` and `RUBRIC.md` into prompt context. |
| `output.template` | worker | Markdown output contract template resolved from the workflow package directory, or from `shared/...` when explicitly referenced, and included as strict return-shape instructions. |
| `output.schema` | worker, optional | JSON schema file to inject near the output contract as concise valid-JSON/self-check instructions. Plain refs are workflow-package-local; `shared/...` refs are explicit shared resources. |
| `instruction` / `instructions` | workflow root, optional runtime prompt capability | Workflow-level instruction appended under the top wrapper before role/output/context layers. It is optional and should not be used for generic orchestration notes that pollute every step prompt; prefer `description`/registry metadata for non-runtime guidance or step-specific `input.prompt` text when only one step needs it. |
| `baton.user_prompt` | baton root, optional | Raw startup user prompt stored at run start; must contain non-whitespace text when present. |
| `baton.user_prompt_injected` | baton root, optional | Runner/runtime marker set after the selected startup-prompt worker output has been applied; prevents reinjection after completion/resume or workflow drift while allowing repeated renders of the same uncompleted worker to preserve the prompt. |

### `input.state`

`input.state` is an allow-list, not a hint. Entries reference workflow step ids whose state may be projected. If `input.state` is absent or empty, no baton state is included.

V1 selectors are top-level workflow step ids only:

- valid examples: `research_draft`, `approve_plan`, `review_join` when those steps exist in the workflow;
- invalid examples: `artifacts`, `results`, `outputs`, `attempts`; reserved runtime aggregate ids are always banned as workflow step ids and projected state selectors;
- invalid nested selectors: `research_draft.route`, `artifacts[0]`, `results.*`, `$..summary`.

Nested path selection should not ship in v1. It creates a query language, partial-object privacy questions, ordering traps, and unclear diagnostics. If needed later, add a separate selector grammar after real use cases exist.

### Prompt template reference

`input.template` is resolved as a workflow-package markdown file. The single base for relative workflow resource references is the directory containing the active `workflow.json`. Dev Harness now omits the obsolete base input template and relies on renderer-owned prompt layering; explicit custom input templates remain separate from output templates.

Resolution must be deterministic and local-only:

1. resolve relative references against the workflow descriptor directory;
2. reject missing files with a hard renderer error;
3. do not fetch templates from the network.

Do not use ambiguous repo-root-relative fallbacks such as `workflows/<name>/schemas/...` inside workflow JSON. Move local resources with the workflow package and reference them as `schemas/...`, `templates/...`, or another path relative to the package directory. Reusable resources under `shared/` must be referenced with normal workflow-relative paths such as `../../shared/templates/...`.

Do not silently ignore a declared `input.template`; missing declared templates fail clearly. Omitted templates use the deterministic default prompt and may emit opt-in diagnostics.

### Output contract references

`output.template` is a markdown output contract. The renderer loads the referenced markdown file and appends it as strict worker return instructions.

`output.schema` is optional prompt guidance. When present, the renderer resolves it using the same canonical workflow-file resolver as output templates: refs are relative to the directory containing the active `workflow.json`. It verifies the file is parseable JSON and injects an instruction to generate strict JSON matching that schema. If render resources provide `validatingWriterCommand`, the injected instruction tells the worker to use that single validating writer command/tool to write the generated JSON; if it returns validation errors, the worker fixes the JSON and reruns the same command/tool for a bounded number of attempts. On success, the writer accepts the output directly into baton/state. If no `validatingWriterCommand` is provided, the instruction says not to invent one and to report the missing writer as a blocker instead of creating an output-path handoff. The deterministic runner validates authoritatively in `workflow-runner write-output` before `continue` applies already-accepted outputs. For output schemas that emit `artifacts`, the renderer also prints deterministic schema-derived artifact field notes from `description` and `x-usage` annotations, resolving local `$ref` and the central Baton artifact `$defs` reference. The renderer does not validate future worker output while rendering. The runtime validates accepted worker JSON again during `apply`.

Rules:

- keep `template` as the existing markdown contract field;
- allow optional `schema` as a JSON schema path relative to the workflow file;
- DevHarness may use `output.schema` on research and implementation-plan worker steps to require reviewer selection state such as `review_plan.reviewers`; this validates/stores the structured output only and does not implement reviewer routing or fan-out;
- reject missing or invalid-JSON schema files with deterministic `WorkflowRuntimeError`;
- do not introduce `format`, `sections`, or similar output contract fields;
- do not validate returned markdown headings at render time;
- steps without `output.schema` keep worker-output envelope validation in the existing `worker-output` schema.


### Harness-side output schema validation

During `apply`, worker steps with `output.schema` use that schema as the authoritative validation gate for the returned JSON. The returned value must parse as JSON; non-JSON output is treated as a schema-validation failure for retry purposes. On a validation failure, the runtime returns the same worker step again, increments `baton.state.attempts["<stepId>:output.schema"]`, and appends a compact deterministic validation-feedback prompt to the directive step input. After three failed attempts, `apply` fails with a deterministic `WorkflowRuntimeError`.

On success, every worker output is stored under `baton.state[stepId]` for later state projection. Validated structured JSON is also mirrored under legacy `baton.state.outputs[stepId]` for compatibility. `artifacts` and `results`, when present in the output, continue to merge into the existing top-level baton state. Steps without `output.schema` keep the previous worker-output envelope validation while still making the full envelope projectable by step id.

### Role material

`input.role` remains a string role name in workflow JSON, but the rendered prompt resolves that name to repository-local role material.

Renderer behavior:

- validate `input.role` as a role directory name (`A-Z`, `a-z`, `0-9`, `_`, `-`) and reject traversal or path-like values;
- resolve role files from `roles/<input.role>/ROLE.md` and `roles/<input.role>/RUBRIC.md` under the repository root;
- inline both files into the fixed `## Role material` section, with deterministic `<!-- role material: ... -->` source comments;
- append a `## Role material` section when `input.role` is present; input templates do not consume role variables;
- fail with a deterministic `WorkflowRuntimeError` when either required role material file is missing or escapes the repository root;
- do not infer capabilities, map roles to subagent agents, or make role required for worker steps unless a separate schema decision is approved.

### Compiled prompt result shape

Add a renderer-level result shape that can be embedded in a future directive or exposed by a CLI command:

```json
{
  "prompt": "...final rendered markdown...",
  "metadata": {
    "outputTemplate": "shared/templates/research-packet-template.md",
    "outputSchema": "schemas/research-output.schema.json",
    "roleMaterial": ["roles/researcher/ROLE.md", "roles/researcher/RUBRIC.md"],
    "projectedStateKeys": ["research_draft", "implementation_plan"]
  }
}
```

Notes:

- `prompt` is the final rendered instruction text. Runtime host requests should expose a short instruction reference/load command instead of embedding this full text.
- `metadata` is optional launch/support data only; it must not require orchestration decisions.
- `diagnostics` is optional and should only be emitted when the caller opts in and diagnostics are present. Hard failures should throw `WorkflowRuntimeError` or a sibling workflow renderer error and surface through CLI stderr.
- Avoid adding this to the existing `inspect` output by default unless Sergey approves response-shape expansion. A separate CLI mode avoids breaking the current directive contract. Keep debug step fields (`stepId`, `action`, `kind`, `name`) in `directive`, not duplicated in `compiledPrompt`.

## `projectState` behavior

Proposed signature:

```js
projectState({ batonState, selectors }) -> { value, projectedKeys, diagnostics }
```

### Selection

- Only keys named by `selectors` are copied from `baton.state`.
- Selector order is preserved from `input.state` after schema-level duplicate rejection; selectors are workflow step ids, not aggregate runtime state keys.
- Absent or empty selectors produce `{}` with no projected keys.

### Missing-key policy

Default v1 policy: `input.state` selectors are strict against declared workflow step ids during semantic validation, but optional relative to the current `baton.state` at prompt-render time.

Rationale: branch/join steps may project every semantically valid branch output while only some branches have actually run in the current baton. Typos such as `artifact` are still rejected by workflow semantic validation because selectors must reference declared workflow step ids.

When a selected step id is absent from `baton.state`, projection skips it and continues with the selectors that are present.

### Nested path policy

Reject nested selectors in v1. A selector is valid only when it matches one declared workflow step id exactly. Suggested validation regex: `/^[A-Za-z_][A-Za-z0-9_-]*$/` plus actual key existence.

Rejected selector examples should produce clear diagnostics:

```text
workflow prompt render failed: step 'research' uses unsupported state selector 'artifacts.0'; v1 supports top-level workflow step ids only
```

### Serialization

State projection inserted into prompts should be serialized as fenced JSON:

````markdown
## Projected baton state

```json
{
  "research_draft": { "summary": "..." },
  "implementation_plan": { "status": "ready" }
}
```
````

Projected field notes:

- before the fenced JSON, the renderer may print `Field notes for projected step outputs` for fields present in projected step outputs;
- field notes come from the producer step `output.schema`, resolving local `$ref` and the central Baton artifact `$defs` reference;
- `description` explains field meaning;
- `x-usage` provides downstream reader guidance using the same existing metadata style as producer notes;
- notes are explanatory only and lower priority than system/workflow/step instructions.

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
renderWorkflowPrompt({ workflowPath, workflow, baton, stepId, step, repositoryRoot, templateBaseDir, userPrompt }) -> compiledPrompt
```

### Inputs

The renderer receives already-validated workflow/baton/step data plus an optional render-time `userPrompt` string. The runner/runtime decides whether startup `baton.user_prompt` is eligible for the current worker and passes it in only then; approval/user-gate answers are different interactions and are not startup `userPrompt`. The template compiler also guards the section to worker steps, so direct approval/later-step callers cannot accidentally render it. The renderer may be called by `inspect`-adjacent code after `loadWorkflowAndBaton`, but it must not call `resolveTransition` or `applyOutputToBatonState`.

### Template resolution

- Load `input.template` when present.
- Load `output.template` when present.
- Load and parse-check `output.schema` when present.
- Resolve relative paths deterministically and reject missing or unsafe paths.
- Do not resolve templates from package registries, URLs, or model output.
- Keep input templates and output templates separate, but resolve both from the workflow package directory.

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
3. `## Output contract` if `output.template` or `output.schema` exists;
4. `## Projected baton state` if `input.state` selected anything;
5. `## Workflow step prompt` if `input.prompt` exists;
6. `## User prompt` from the optional render-time `userPrompt` value, only when the runner/runtime has selected this worker as the one startup prompt recipient and that selected worker output has not yet set `baton.user_prompt_injected`; repeated renders before completion preserve the section for the same worker;
7. final reminder when an output contract exists.

This keeps the output contract high for primacy, places context before the executable step/user request, and keeps a short output-contract reminder at the bottom for recency. It intentionally does not preserve compatibility with older placeholder templates.

### Output rules inclusion

Output contract section format:

```markdown
## Output contract

Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.

<!-- output template: templates/research-packet-template.md -->

<template contents>
```

When an `output.schema` exists, the same section appends generated schema-derived notes and the strict JSON schema. Artifact producer mechanics come from schema `description`/`x-usage` metadata, not workflow prompt prose or markdown templates. The envelope remains the existing worker/approval output JSON contract (`outcome` or `approval`, optional `artifacts`, `results`, `blocker`). The markdown template describes artifact content expected from the child, not a JSON schema.

Projected baton state may also prepend schema-derived reader notes from projected producer schemas. Artifact consumer mechanics come from schema `description`/`x-usage` metadata; the projected JSON value remains authoritative.

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
node ./lib/entrypoints/cli/workflow-runner.mjs next --lease-token <token> --run-id <run-id> --workflow <workflow.json> [--diagnostics]
```

Output shape:

```json
{
  "baton": { "cursor": "review", "status": "running", "state": { "research_draft": { }, "implementation_plan": { } } },
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

Diagnostics are machine-readable in compiled results only when rendering succeeds with non-fatal notices and the caller opts in, for example CLI `render --diagnostics`. The current non-fatal diagnostic is `default_prompt_used`, emitted when a step has no `input.template` and the renderer assembles the deterministic fallback prompt. Missing selected step outputs are normal branch/join state and are skipped without diagnostics.

## Test plan

All tests deterministic; no LLM, model, network, or subagent calls.

Unit tests:

- `projectState` includes only explicit keys.
- `projectState` preserves selector order.
- `projectState` skips selected step ids that are absent from the current baton state.
- `projectState` rejects nested selectors.
- `projectState` serializes stable fenced JSON.
- `renderWorkflowPrompt` renders default prompt when no input template exists.
- `renderWorkflowPrompt` emits default-prompt diagnostics only when requested.
- `renderWorkflowPrompt` rejects unsupported placeholders in input templates.
- `renderWorkflowPrompt` appends role/output/state/workflow-step/user-prompt/reminder sections in fixed order.
- `renderWorkflowPrompt` keeps output contracts as static included contract text.
- `renderWorkflowPrompt` includes shared output template content without treating it as schema.
- `renderWorkflowPrompt` derives artifact producer notes from `output.schema` + central Baton artifact `$defs` metadata, without hardcoded DevHarness artifact prose in workflow prompts.
- `renderWorkflowPrompt` derives projected artifact reader notes from producer schemas before projected JSON.
- path resolver rejects path escape and missing template references.

CLI/smoke tests:

- `runner render path on a minimal fixture returns `compiledPrompt.prompt` and does not mutate baton file.
- `runner render path on Dev Harness fixture succeeds through renderer-owned prompt layering and fails clearly if a declared input template is missing.
- ``next --diagnostics` includes non-fatal diagnostics while plain `render` omits them.
- host response shape keeps instruction load references instead of embedding full prompt text.
- `apply` without `output.schema` behavior remains unchanged.
- `apply` stores each worker output under `baton.state[stepId]`, mirrors structured `output.schema` outputs under `baton.state.outputs[stepId]`, and keeps `artifacts`/`results` aggregation intact.
- `apply` with invalid structured output retries with validation feedback, then fails deterministically after the bounded attempt limit.

Schema tests:

- existing `output` only accepts `{ "template": "..." }`.
- `input.state` remains a unique string array.
- optional schema for compiled prompt response rejects extra top-level fields if a schema is added.

## Maintenance plan

Keep the v3 split stable:

1. Put new CLI/API behavior in `entrypoints/`; do not let it leak into entities.
2. Put filesystem/resource loading and durable writes in `persistence/`; use-cases and entities stay IO-free.
3. Put orchestration that combines workflow, baton, step, template, output, and instruction DTOs in named `use-cases/` files.
4. Put workflow invariants in `Workflow`, runtime-state invariants in `Baton`, step/run validation and render-context preparation in `Step`, and rendering mechanics in `Template`/template compiler helpers.
5. Keep `output.template` as markdown and `output.schema` as JSON schema resources resolved by persistence before use-cases need them.
6. Preserve host requests as instruction references/load commands; do not embed full prompt text in host requests by default.

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

- If renderer starts looking at `next`, it is becoming transition/runtime logic.
- If renderer starts choosing agents, it is becoming orchestrator logic.
- If renderer starts interpreting markdown output templates as schemas, it is violating #87.
- If renderer starts inferring state from baton instead of `input.state`, it is leaking context by default.
- If renderer accepts placeholders, it will become an undocumented programming language before there is a concrete need.

## Settled v3 decisions

1. Runtime ownership follows `entrypoints -> persistence -> use-cases -> entities -> dtos`.
2. Prompt rendering lives under `Step`/`Template` responsibilities: `Step` prepares context; `Template` renders text.
3. Host requests expose load-instructions commands/references rather than full compiled prompts.
4. Missing declared templates, schemas, role material, and invalid instruction requests fail deterministically at the owning boundary.
