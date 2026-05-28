---
name: develop-workflow-runtime
description: Run workflow-runner host requests through the deterministic host adapter loop.
---

# Workflow Runtime Host Adapter

Boundary: this skill is only the host adapter loop; the runner owns workflow state, transitions, baton files, and terminal decisions.

## Main loop

1. Start or resume the runner.
   - Start: `node develop/scripts/workflow-runner.mjs next --run-dir <run-dir> [--workflow <workflow.json>]`
   - Resume: `node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> --output <artifact.json> [--output <step-id=artifact.json> ...] [--workflow <workflow.json>]`
2. Read the runner response.
   - If it is terminal `done` or `blocked`, report that result and stop.
   - If it asks for host action, execute only the returned request or requests.
3. If the request action is `run_worker`, spawn one fresh worker.
   - Put the request's instruction-loading command into the bootstrap template below.
   - The field may be named `loadInstructionsCommand`; that just means: run the command from the request.
4. If the response contains parallel worker requests, spawn all fresh workers in parallel.
   - Use each request's own instruction-loading command.
   - Do not reuse worker sessions across requests.
5. Capture every worker result as a host-owned artifact.
   - The artifact path/name is wrapper-owned transport, not runner contract.
   - The artifact content passed back to `continue` must be workflow-compatible JSON/envelope.
6. If the response asks the user or needs approval, ask the user exactly for that decision.
   - Capture the user's answer as the artifact/result the runner expects.
   - Pass it back with `continue`.
7. Repeat: call `continue` with the produced artifact or artifacts, then handle the next runner response.

## Worker bootstrap template

```text
Load the step instructions by running:

<command from the runner request>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```

## Hard rules

- Do not choose next steps, branches, joins, retries, `done`, or `blocked`.
- Do not edit baton, runner state, or persisted instruction files manually.
- Do not paste compiled instructions into parent context.
- Do not invent outputs, success, approval, or user answers.
- Do not pass architecture notes back as worker output.
- Pass only actual worker results, user answers, or blocked/error artifacts back to the runner.
- Keep architecture details in `develop/docs/workflow-runtime-adapter.md`, not here.
