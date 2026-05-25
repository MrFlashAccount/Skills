---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Run the DevHarness loop. Do not decide workflow transitions yourself. Follow the current directive returned by the scripts.

## Available scripts

Run commands from this skill directory.

- `scripts/start-run.mjs` — call script and use the returned `{ baton, directive }`.
- `scripts/workflow-interpreter.mjs apply ...` — apply one worker/approval output to the live baton.
- `scripts/persist-run-state.mjs` — persist a successful apply response/output/decision and return the next `{ baton, directive }`.

## Run state

Require a concrete caller-provided run directory. Do not invent or derive a run id.

Call script:

```bash
scripts/start-run.mjs --run-dir <run-dir>
```

Use the returned `{ baton, directive }` as the live loop state. Scripts own run-state file reads/writes; do not edit baton by hand.

## Main loop

Strictly follow these steps.

1. If `directive.action` is `stop_done` or `stop_blocked`, exit the loop and report the returned summary/blocker.
2. Else if `directive.action` is `run_worker`:
   - Build one bounded prompt from the directive.
   - Launch exactly one bounded subagent/executor.
   - Require strict JSON output for that directive only.
   - Store the result as `output.json`.
   - Do not perform the worker step yourself.
3. Else if `directive.action` is `wait_for_approval`, stop and wait for explicit approval JSON, then store it as `output.json`.
4. Else stop as blocked for unknown `directive.action`.
5. Call workflow interpreter:

   ```bash
   scripts/workflow-interpreter.mjs apply dev-harness.workflow.json baton.json output.json
   ```

   `baton.json` is the current live baton state serialized for the call. `output.json` is the result from the previous worker/approval step.
6. If `apply` fails, stop as blocked. Do not rerun the worker/approval step.
7. If `apply` succeeds, store the workflow interpreter response as `apply-response.json`, then call persist-state:

   ```bash
   scripts/persist-run-state.mjs --run-dir <run-dir> --response apply-response.json --output output.json --decision "<decision>"
   ```

   `decision` is the decision label/value from this loop step.
8. If persist-state fails, stop as blocked.
9. If persist-state succeeds, replace the live `{ baton, directive }` with the returned/current values and return to Main loop step 1.
