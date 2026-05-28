---
name: develop-workflow-runtime
description: Use for running a workflow through workflow-runner host requests, bounded workers, and explicit approval waits.
---

# Workflow Runtime

Run workflows by driving the `workflow-runner` request loop. Do not decide workflow transitions yourself.

## Variables

- `<run-dir>`: current run directory.
- `<workflow>`: workflow definition path, when not already stored in the run.
- `<result.json>`: JSON result file produced for one host request.
- `<step-id>`: id of a request/step from `response.requests[]`.

## Runner commands

Start or resume a run:

```bash
node develop/scripts/workflow-runner.mjs next --run-dir <run-dir> --workflow <workflow>
```

Continue after host request results are ready:

```bash
node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> --output <result.json>
```

For multiple request results, name every output:

```bash
node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> \
  --output <step-id>=<result.json> \
  --output <step-id>=<result.json>
```

Load worker instructions for one request:

```bash
node develop/scripts/workflow-runner.mjs instructions --run-dir <run-dir> --step-id <step-id>
```

## Request loop

1. Call `workflow-runner next` for a new/resumed run, or `workflow-runner continue` after request results are ready.
2. Read `response.status`.
3. If `response.status` is `done`, stop and report the completed result.
4. If `response.status` is `blocked`, stop and report the blocker.
5. If `response.status` is `needs_host_actions`, execute every request in `response.requests[]`.
6. For each `run_worker` request, launch a fresh worker with the bootstrap below.
7. For each `wait_for_approval` request, get an explicit user answer via the host.
8. Write one JSON result file per request.
9. Pass all request results back to `workflow-runner continue`.
10. Repeat from step 2.

## Host request rules

- Treat `response.requests[]` as the complete list of required host actions.
- Execute every request in the list before continuing.
- `run_worker` may appear more than once; run those workers in parallel when safe.
- `wait_for_approval` is also a request; do not skip it or infer approval.
- Use each request `id`/`stepId` when naming outputs for multiple requests.
- Result files and paths are only transport for `workflow-runner continue`; do not treat them as business concepts.
- If a worker, approval, or output file is missing, stop as blocked instead of guessing.

## Worker bootstrap template

```text
Load the step instructions by running:

<command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```
