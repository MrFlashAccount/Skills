---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the workflow interpreter.
---

# Dev Harness

Run the DevHarness orchestrator loop. The orchestrator only does:

`prompt -> subagent -> output -> apply -> persist -> repeat`

Do not decide workflow transitions yourself. Follow the current directive returned by the scripts.

## Available scripts

Run commands from this skill directory so script paths stay relative to the skill root.

- `scripts/start-run.mjs` — start or resume a caller-provided run directory and return the current `{ baton, directive }`.
- `scripts/workflow-interpreter.mjs apply ...` — apply one worker/approval output to the live baton and return the next response.
- `scripts/persist-run-state.mjs` — persist a successful apply response/output/decision and return the next `{ baton, directive }`.

## Run state

Require a concrete caller-provided run directory. Do not invent or derive a run id.

On start/resume, call:

```bash
node scripts/start-run.mjs --run-dir <run-dir>
```

Use the returned `{ baton, directive }` as the live in-memory loop state. Scripts own run-state file reads/writes; do not edit baton by hand, duplicate its schema, or describe folder internals in worker prompts.

## Main loop

Repeat until stopped:

1. If `directive.action` is `stop_done` or `stop_blocked`, exit the loop and report the returned summary/blocker.
2. If `directive.action` is `run_worker`:
   - Build one bounded prompt from the directive.
   - Launch exactly one bounded subagent/executor.
   - Require strict JSON output for that directive only.
   - Do not perform the worker step yourself.
3. If `directive.action` is `wait_for_approval`, stop and wait for explicit approval JSON before continuing.
4. Call the workflow interpreter `apply` with the live baton and the worker/approval output:

   ```bash
   node scripts/workflow-interpreter.mjs apply dev-harness.workflow.json <baton-json> <output-json>
   ```

5. If `apply` fails, keep the live and persisted baton unchanged. Retry the same directive/current step, or stop blocked if retry cannot proceed safely.
6. If `apply` succeeds, call the persist script with the returned response, the worker/approval output, and a short decision:

   ```bash
   node scripts/persist-run-state.mjs --run-dir <run-dir> --response <apply-response-json> --output <output-json> --decision "<short decision>"
   ```

7. If persistence fails, stop as blocked. Do not continue with ambiguous run state.
8. If persistence succeeds, replace the live `{ baton, directive }` with the values returned by the persist script and go back to step 1.

Keep the loop compact and mechanical: prompt, subagent, output, script, persist, repeat.
