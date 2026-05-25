---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Run the DevHarness workflow from the current directive. Do not decide workflow transitions yourself.

## Variables

- `<run-dir>`: existing/current run state directory chosen by the caller/orchestrator.
- `<baton.json>`: JSON file containing the current live baton.
- `<output.json>`: strict JSON output from the worker subagent or human approval step for the current directive.
- `<apply-response.json>`: JSON response from `scripts/workflow-interpreter.mjs apply`; contains the returned baton/directive.
- `<decision>`: compact decision label for this loop application, if persist requires it.

## Start run prerequisite

Before entering the main loop, call the start script with `<run-dir>`:

```bash
scripts/start-run.mjs --run-dir <run-dir>
```

It returns `{ baton, directive }`. Store that returned pair as the live state and write the current baton to `<baton.json>`.

## Main loop

Strictly follow these four steps.

1. Evaluate `directive.action`:
   - if `stop_done` or `stop_blocked`: exit the loop and report the returned summary/blocker.
   - if `run_worker`: build one bounded prompt from the directive, launch exactly one bounded subagent/executor, require strict JSON output for that directive only, and write the result to `<output.json>`.
   - if `wait_for_approval`: stop and wait for explicit approval JSON, then use it as `<output.json>`.
   - else: exit as blocked for unknown `directive.action`.
2. Call workflow interpreter apply with `<baton.json>` and `<output.json>`; write stdout to `<apply-response.json>`:

   ```bash
   scripts/workflow-interpreter.mjs apply dev-harness.workflow.json <baton.json> <output.json> > <apply-response.json>
   ```

   If apply fails, exit as blocked; do not rerun the worker/approval step automatically.
3. Call persist script with `<run-dir>`, `<apply-response.json>`, `<output.json>`, and `<decision>`:

   ```bash
   scripts/persist-run-state.mjs --run-dir <run-dir> --response <apply-response.json> --output <output.json> --decision "<decision>"
   ```

   If persist fails, exit as blocked.
4. Replace the live `{ baton, directive }` with the values from `<apply-response.json>` and return to step 1.
