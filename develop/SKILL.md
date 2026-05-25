---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Orchestrate one script-directed workflow loop against persisted run state. DevHarness is loop-like: keep a compact baton between iterations, but do not decide the next action by protocol. Before each iteration, call the workflow interpreter and follow the returned directive.

## Available scripts

- `scripts/workflow-interpreter.mjs` — non-interactive runtime script. It reads workflow/baton/output JSON files, writes one JSON response to stdout, writes diagnostics/errors to stderr, and exits non-zero on failure.
- `scripts/persist-run-state.mjs` — non-interactive runtime script. It atomically replaces `<run-dir>/baton.json` with the returned baton and appends one compact entry to `<run-dir>/history.md`.

Run commands from this skill directory so script paths stay relative to the skill root.

## Run state

Create or reuse one per-run state directory before starting, for example `.dev-harness-runs/<run-id>/` in the current workspace or another caller-provided scratch location. Keep all run-local files there:

- `baton.json` — the current persisted baton, owned by the workflow interpreter and schema.
- `history.md` — compact iteration notes: directive, worker/approval output path, verification, decision; debug/history belongs here, not in baton.
- `outputs/` — worker outputs, approval JSON, blockers, summaries, and other artifacts that are too large to keep inline.

On resume, read the latest persisted `baton.json`, last history entry, and relevant output files. Inspect current artifacts/state when needed; do not trust stale notes blindly.

## Workflow

1. Read the persisted baton from the run directory. Do not read, load, summarize, or iterate the workflow JSON; it is a script asset, not agent context.
2. Before entering the loop, and before every next iteration after resume or successful apply, call the workflow interpreter:

   ```bash
   node scripts/workflow-interpreter.mjs inspect dev-harness.workflow.json <run-dir>/baton.json
   ```

3. Follow only the returned `directive`; do not infer step transitions yourself.
4. If `directive.action == "run_worker"`, launch exactly one bounded subagent/executor for that directive. Give it only the task/directive context needed for the current cursor, not the workflow graph or transition authority. It must return strict worker output JSON/artifacts for that cursor. The orchestrator must write that output under `<run-dir>/outputs/`; history is appended only by the persist helper after a successful apply. The orchestrator must not perform the worker step itself. If delegated execution is unavailable, stop as blocked.
5. If `directive.action == "wait_for_approval"`, stop and wait for explicit human approval before writing approval JSON under `<run-dir>/outputs/`.
6. After worker output or approval output exists, call the workflow interpreter with that output:

   ```bash
   node scripts/workflow-interpreter.mjs apply dev-harness.workflow.json <run-dir>/baton.json <run-dir>/outputs/<output>.json
   ```

7. If the workflow interpreter succeeds, persist the returned response before continuing:

   ```bash
   node scripts/persist-run-state.mjs --run-dir <run-dir> --response <run-dir>/outputs/<apply-response>.json --output <run-dir>/outputs/<output>.json --decision "<short decision>"
   ```

   The persist helper validates readability before mutation, atomically replaces `<run-dir>/baton.json`, and appends the matching `<run-dir>/history.md` entry in the same persistence step. After it succeeds, continue from the returned `directive`.
8. If worker output or the workflow interpreter fails, keep the old baton unchanged, append failure/blocker detail to history when useful, and retry the same baton/current cursor unless an approval or safety boundary requires stopping. If persistence fails, stop as blocked; do not continue with ambiguous run state.
9. Loop until `directive.action` is `stop_done` or `stop_blocked`, or until the workflow interpreter returns a blocker. Store the final summary/blocker output in the run directory.

## Baton rules

- Treat baton JSON as opaque; do not edit it by hand and do not re-create its schema in prompts.
- Persist only the baton returned by the workflow interpreter after a successful `apply`.
- On failure, keep the previous persisted baton and retry the same baton.
- Store worker/approval outputs in the run directory when needed; keep the baton compact.
- Use the workflow interpreter's returned directive as the executable instruction for the current cursor.
