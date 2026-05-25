---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Run the DevHarness workflow from `<directive>`. Do not decide workflow transitions yourself.

## Variables

- `<run-dir>`: existing/current run state directory chosen by the caller/orchestrator.
- `<baton.json>`: JSON file containing the current live baton.
- `<directive>`: current workflow directive returned by start-run or the workflow interpreter.
- `<output.json>`: output from the worker subagent or user approval step for `<directive>`.
- `<apply-response.json>`: JSON response from `scripts/workflow-interpreter.mjs apply`; contains the returned baton and `<directive>`.
- `<decision>`: compact decision label for this loop application, if persist requires it.

## Start run prerequisite

Before entering the main loop, call the start script with `<run-dir>`:

```bash
scripts/start-run.mjs --run-dir <run-dir>
```

It returns `{ baton, directive }`. Put the returned baton into `<baton.json>` / baton variable, and put the returned directive into `<directive>`.

## Main loop

Strictly follow these four steps.

1. Evaluate `<directive>.action`:
   - if `stop_done` or `stop_blocked`: exit the loop with the returned result.
   - if `run_worker`: build one bounded prompt from `<directive>`, launch exactly one bounded subagent/executor, and write the result to `<output.json>`.
   - if `wait_for_approval`: wait for explicit user response/approval, e.g. LGTM/ПОДТВЕРЖДАЮ as appropriate, then write that response to `<output.json>`.
   - else: exit as blocked for unknown `<directive>.action`.
2. Call workflow interpreter:

   ```bash
   scripts/workflow-interpreter.mjs apply dev-harness.workflow.json <baton.json> <output.json>
   ```

   Store the response as `<apply-response.json>`. If it fails, exit as blocked; do not rerun the worker/approval step automatically.
3. Call persist script with `<run-dir>`, `<apply-response.json>`, `<output.json>`, and `<decision>`:

   ```bash
   scripts/persist-run-state.mjs --run-dir <run-dir> --response <apply-response.json> --output <output.json> --decision "<decision>"
   ```

   If persist fails, exit as blocked.
4. Update `<baton.json>` from `<apply-response.json>.baton`, update `<directive>` from `<apply-response.json>.directive`, then return to step 1.
