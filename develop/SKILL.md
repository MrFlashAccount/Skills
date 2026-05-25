---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Run the DevHarness loop. Do not decide workflow transitions yourself. Follow the current directive returned by the scripts.

## Available scripts

Run commands from this skill directory.

- `scripts/start-run.mjs` — start or resume a caller-provided run directory and return the live baton/directive.
- `scripts/workflow-interpreter.mjs apply ...` — apply one worker/approval output to the current live baton.
- `scripts/persist-run-state.mjs` — persist a successful apply response/output/decision.

## Variables

- `<run-dir>`: existing/current run state directory chosen by the caller/orchestrator.
- `<baton.json>`: JSON file containing the current live baton from `start-run` or the last `workflow-interpreter` response; inside the loop, use the current live baton, do not invent it.
- `<output.json>`: strict JSON output from the worker subagent or human approval step for the current directive.
- `<apply-response.json>`: JSON response from `scripts/workflow-interpreter.mjs apply`; contains the returned baton/directive.
- `<decision>`: compact decision label for this loop application, if persist requires it.

## Main loop

Strictly follow these steps.

1. Call start script with `<run-dir>`; store the returned live `{ baton, directive }` and current baton file as `<baton.json>`:

   ```bash
   scripts/start-run.mjs --run-dir <run-dir>
   ```

2. Evaluate `directive.action`:
   - if `stop_done` or `stop_blocked`: exit the loop and report the returned summary/blocker.
   - if `run_worker`: build one bounded prompt from the directive, launch exactly one bounded subagent/executor, require strict JSON output for that directive only, and write the result to `<output.json>`.
   - if `wait_for_approval`: stop and wait for explicit approval JSON, then use it as `<output.json>`.
   - else: exit as blocked for unknown `directive.action`.
3. Call workflow interpreter apply with `<baton.json>` and `<output.json>`; write stdout to `<apply-response.json>`:

   ```bash
   scripts/workflow-interpreter.mjs apply dev-harness.workflow.json <baton.json> <output.json> > <apply-response.json>
   ```

   If apply fails, exit as blocked; do not rerun the worker/approval step automatically.
4. Call persist script with `<run-dir>`, `<apply-response.json>`, `<output.json>`, and `<decision>`:

   ```bash
   scripts/persist-run-state.mjs --run-dir <run-dir> --response <apply-response.json> --output <output.json> --decision "<decision>"
   ```

   If persist fails, exit as blocked.
5. Replace the live `{ baton, directive }` with the values from `<apply-response.json>` and return to step 2.
