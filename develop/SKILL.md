---
name: develop-workflow-runtime
description: Use for requests that should run a baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Workflow Runtime

Run the selected workflow definition from `<steps>`. Do not decide workflow transitions yourself.

## Variables

- `<run-dir>`: existing/current run state directory chosen by the caller/orchestrator.
- `<workflow>`: workflow file provided by the caller, selected workflow definition, or configured workflow path.
- `<baton.json>`: JSON file containing the current live baton.
- `<steps>`: current executable step array returned by start-run or the workflow interpreter.
- `<output.json>`: output from the worker subagent, user approval step, or parallel branch wrapper for `<steps>`.
- `<apply-response.json>`: JSON response from `scripts/workflow-interpreter.mjs apply`; contains the returned baton and `steps[]`.
- `<render-response.json>`: JSON response from `scripts/workflow-interpreter.mjs render`; contains `steps[]`, each with its rendered `compiledPrompt`.
- `<decision>`: compact decision label for this loop application, if persist requires it.

## Start run prerequisite

Before entering the main loop, call the start script with `<run-dir>`:

```bash
scripts/start-run.mjs --run-dir <run-dir>
```

It returns `{ baton, steps }`. Put the returned baton into `<baton.json>` / baton variable, and put the returned steps into `<steps>`.

## Main loop

Strictly follow these four steps.

1. Evaluate `<steps>`:
   - if it has one step with `stop_done` or `stop_blocked`: exit the loop with the returned result.
   - if it has one step with `run_worker`: render/build one bounded prompt from that step, launch exactly one bounded subagent/executor, and write the result to `<output.json>`.
   - if it has more than one step: call `scripts/workflow-interpreter.mjs render <workflow> <baton.json>` and use `<render-response.json>.steps[]` to launch each branch prompt from `compiledPrompt`. Wait for every result, and write `<output.json>` as `{ "steps": { "<stepId>": <worker-or-approval-output> } }`. Parallel step outputs remain separate in `baton.state[stepId]`; the workflow then advances to the explicit join step.
   - if it has one step with `wait_for_approval`: wait for explicit user response/approval, e.g. LGTM/ПОДТВЕРЖДАЮ as appropriate, then write that response to `<output.json>`.
   - else: exit as blocked for unknown step action.
2. Call workflow interpreter:

   ```bash
   scripts/workflow-interpreter.mjs apply <workflow> <baton.json> <output.json>
   ```

   Store the response as `<apply-response.json>`. If it fails, exit as blocked; do not rerun the worker/approval step automatically.
3. Call persist script with `<run-dir>`, `<apply-response.json>`, `<output.json>`, and `<decision>`:

   ```bash
   scripts/persist-run-state.mjs --run-dir <run-dir> --response <apply-response.json> --output <output.json> --decision "<decision>"
   ```

   If persist fails, exit as blocked.
4. Update `<baton.json>` from `<apply-response.json>.baton`, update `<steps>` from `<apply-response.json>.steps`, then return to step 1.

## Worker bootstrap template

```text
Load the step instructions by running:

<command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```
