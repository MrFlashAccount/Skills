---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Orchestrate one script-directed workflow loop against persisted run state. DevHarness is a closed loop: keep a compact baton between iterations, but do not decide the next action by protocol. Before each iteration, call the runtime start/resume script or workflow interpreter and follow the returned directive.

## Available scripts

- `scripts/start-run.mjs` — start or resume a run directory. It creates the run directory when missing, initializes `baton.json` and `history.md` when missing, inspects the current baton, writes one JSON status/response to stdout, writes diagnostics/errors to stderr, and exits non-zero on failure.
- `scripts/workflow-interpreter.mjs` — non-interactive runtime script. It reads workflow/baton/output JSON files, writes one JSON response to stdout, writes diagnostics/errors to stderr, and exits non-zero on failure.
- `scripts/persist-run-state.mjs` — persist returned run state after a successful interpreter apply.

Run commands from this skill directory so script paths stay relative to the skill root.

## Start or resume

Require a concrete caller-provided run directory. Do not invent or derive a run id.

```bash
node scripts/start-run.mjs --run-dir <run-dir>
```

The command returns JSON containing the persisted `baton.json`, `history.md`, whether the run was initialized or resumed, and the current workflow interpreter `response.directive`. Restarting with the same `--run-dir` resumes from the existing persisted baton instead of overwriting it.

## Run state

Use one per-run state directory supplied by the caller, for example `.dev-harness-runs/<run-id>/` in the current workspace or another caller-provided scratch location. Keep all run-local files there:

- `baton.json` — the current persisted baton, owned by the workflow interpreter and schema.
- `history.md` — compact iteration notes: directive, worker/approval output path, verification, decision; debug/history belongs here, not in baton.
- `outputs/` — worker outputs, approval JSON, blockers, summaries, and other artifacts that are too large to keep inline.

On resume, run `scripts/start-run.mjs --run-dir <run-dir>` and use the returned directive. Inspect current artifacts/state when needed; do not trust stale notes blindly.

## Workflow

1. Start or resume the run:

   ```bash
   node scripts/start-run.mjs --run-dir <run-dir>
   ```

2. Follow only the returned `response.directive`; do not infer step transitions yourself.
3. If `directive.action == "run_worker"`, launch exactly one bounded subagent/executor for that directive. Give it only the task/directive context needed for the current cursor, not the workflow graph or transition authority. It must return strict worker output JSON/artifacts for that cursor. The orchestrator must write that output under `<run-dir>/outputs/` and must not perform the worker step itself. If delegated execution is unavailable, stop as blocked.
4. If `directive.action == "wait_for_approval"`, stop and wait for explicit human approval before writing approval JSON under `<run-dir>/outputs/`.
5. After worker output or approval output exists, call the workflow interpreter with that output:

   ```bash
   node scripts/workflow-interpreter.mjs apply dev-harness.workflow.json <run-dir>/baton.json <run-dir>/outputs/<output>.json
   ```

6. If the workflow interpreter `apply` succeeds, persist the returned state before continuing. This persistence is mandatory before the next iteration:

   ```bash
   node scripts/persist-run-state.mjs --run-dir <run-dir> --response <run-dir>/outputs/<apply-response>.json --output <run-dir>/outputs/<output>.json --decision "<short decision>"
   ```

   If worker output, interpreter `apply`, or persistence fails, keep the old baton unchanged, append failure/blocker detail to history when useful, and retry the same baton/current cursor unless an approval or safety boundary requires stopping. If persistence fails, stop as blocked; do not continue with ambiguous run state.
7. After successful persistence, call the workflow interpreter again against the same run dir before doing anything else:

   ```bash
   node scripts/workflow-interpreter.mjs inspect dev-harness.workflow.json <run-dir>/baton.json
   ```

8. Continue this live in-memory baton loop until `directive.action` is `stop_done` or `stop_blocked`, or until the workflow interpreter returns a blocker. Store the final summary/blocker output in the run directory.

## Baton rules

- Treat baton JSON as opaque; do not edit it by hand and do not re-create its schema in prompts.
- Persist only the baton returned by the workflow interpreter after a successful `apply`.
- On failure, keep the previous persisted baton and retry the same baton.
- Store worker/approval outputs in the run directory when needed; keep the baton compact.
- Use the workflow interpreter's returned directive as the executable instruction for the current cursor.
- Do not read, load, summarize, or iterate the workflow JSON as agent context; it is a script asset, not an agent prompt input.
