---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the handoff helper.
---

# Dev Harness

Orchestrate one script-directed workflow loop against persisted run state. DevHarness is loop-like: keep a compact baton between iterations, but do not decide the next action by protocol. Before each iteration, call the handoff script and follow the returned directive.

## Run state

Create or reuse one per-run state directory before starting, for example `.dev-harness-runs/<run-id>/` in the current workspace or another caller-provided scratch location. Keep all run-local files there:

- `baton.json` — the current persisted baton, owned by the handoff script and schema.
- `ledger.md` or `ledger.jsonl` — compact iteration notes: directive, worker/approval output path, verification, decision.
- `outputs/` — worker outputs, approval JSON, blockers, summaries, and other artifacts that are too large to keep inline.

On resume, read the latest persisted `baton.json`, last ledger entry, and relevant output files. Inspect current artifacts/state when needed; do not trust stale notes blindly.

## Workflow

1. Read the persisted baton from the run directory. Do not read, load, summarize, or iterate the workflow JSON; it is a script asset, not agent context.
2. Before entering the loop, and before every next iteration after resume or successful apply, call the helper from the repo root:

   ```bash
   node develop/dev-harness-step.mjs inspect develop/dev-harness.workflow.json <run-dir>/baton.json
   ```

3. Follow only the returned `directive`; do not infer step transitions yourself.
4. If `directive.action == "run_worker"`, run one bounded worker for that directive, write its strict JSON output under `<run-dir>/outputs/`, and record the path in the ledger.
5. If `directive.action == "wait_for_approval"`, stop and wait for explicit human approval before writing approval JSON under `<run-dir>/outputs/`.
6. After worker output or approval output exists, call the helper with that output:

   ```bash
   node develop/dev-harness-step.mjs apply develop/dev-harness.workflow.json <run-dir>/baton.json <run-dir>/outputs/<output>.json
   ```

7. If the helper succeeds, persist the returned `baton` by writing it to a temporary file and atomically replacing `<run-dir>/baton.json`; then ledger the result and continue from the returned `directive`.
8. If worker output or the helper fails, keep the old baton unchanged, ledger the failure/blocker, and retry the same baton/current cursor unless an approval or safety boundary requires stopping.
9. Loop until `directive.action` is `stop_done` or `stop_blocked`, or until the helper returns a blocker. Store the final summary/blocker output in the run directory.

## Baton rules

- Treat baton JSON as opaque; do not edit it by hand and do not re-create its schema in prompts.
- Persist only the baton returned by the handoff helper after a successful `apply`.
- On failure, keep the previous persisted baton and retry the same baton.
- Store worker/approval outputs in the run directory when needed; keep the baton compact.
- Use the handoff helper's returned directive as the executable instruction for the current cursor.
