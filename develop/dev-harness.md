# DevHarness prototype

Minimal deterministic transition helper for a staged DevHarness workflow.

Files:

- `dev-harness.workflow.yaml` — workflow steps, required outputs, and allowed transitions
- `dev-harness.baton.schema.yaml` — minimum baton shape
- `dev-harness-step.mjs` — executable transition helper
- `fixtures/` — tiny runnable example inputs and negative cases

Run a worker/subagent step:

```bash
node develop/dev-harness-step.mjs \
  develop/dev-harness.workflow.yaml \
  develop/fixtures/baton.yaml \
  develop/fixtures/worker-output.yaml
```

Run an approval step:

```bash
node develop/dev-harness-step.mjs \
  develop/dev-harness.workflow.yaml \
  develop/fixtures/approval-baton.yaml \
  develop/fixtures/approval-output.yaml
```

The script reads workflow, baton, and worker/approval output as JSON or a small YAML subset. On success it prints `{ baton, nextStep }` JSON to stdout. On invalid baton shape, missing step, missing produced field, mixed `outcome`/`approval`, unknown transition, or invalid transition target, it prints an error to stderr and exits non-zero without writing files.

Current script-level enforcement:

- supported `takes` paths on the current step (`artifacts.*`, `approvals.*`) must exist in the current baton before transition
- every `produces` path on the current worker/subagent step must exist in the current worker output itself; stale fields already present in the baton do not satisfy `produces`
- produced paths are limited to `artifacts.*` and `approvals.*`
- `user_approval` steps accept `approval`, reject `outcome`, and must write required records under `approvals` in the approval output
- non-approval worker/subagent steps accept `outcome` and reject `approval`
- transition labels are looked up in the current step's `outcomes` map only

Supported YAML subset/format:

- indentation-based maps with scalar keys, including nested `workflow.steps.<step_id>` maps
- lists of scalars for fields such as `takes`, `produces`, and prompt input lists
- scalar values: strings, booleans, null, and numbers
- inline maps like `{ key: value }`
- comments beginning with `#` outside quotes
- branched transitions as scalar maps under `outcomes`, e.g. `approved: implementation`
- direct scalar fields already used by the workflow, e.g. `kind`, `template`, `start`, `done`, `blocked`
- prompt/template scalar fields already present in the workflow, e.g. `template: dev_harness.research`

Transition limitation: the helper currently supports only `outcomes` maps. It does not support a separate direct-transition field such as `next: step_id`; a one-way transition must still be represented as a single-entry `outcomes` map.

Not supported by the current parser: quoted multiline strings, anchors, complex YAML types, list items containing nested maps, or multiple YAML documents.

Scope is intentionally small: no runner engine, no agent spawning, no LLM answer validation, no external integrations.
