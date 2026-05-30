---
name: develop-workflow-runtime
description: Use for running a workflow from the repo root through workflow-runner host requests, bounded workers, and user-input waits.
---

# Workflow Runtime

Run workflows by driving the `workflow-runner` request loop from the repository root. Do not decide workflow transitions yourself.

## Variables

- `<run-dir>`: current run directory; keep using the same value for the whole run.
- `<workflow>`: workflow definition path for the initial `next`; same-run `continue` reuses the workflow stored in the run unless you explicitly override it.
- `<result.json>`: JSON host-output file produced for one host request.
- `<step-id>`: id of a request/step from `response.requests[]`.

## Runner commands

Start or resume a run from the repo root:

```bash
node develop/scripts/workflow-runner.mjs next --run-dir <run-dir> --workflow <workflow>
```

Continue after host request outputs are ready:

```bash
node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> --output <result.json>
```

For multiple request outputs, name every output:

```bash
node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> \
  --output <step-id>=<result.json> \
  --output <step-id>=<result.json>
```

Load instructions for one request:

```bash
node develop/scripts/workflow-runner.mjs instructions --run-dir <run-dir> --step-id <step-id>
```

## Request loop

1. From the repo root, call `workflow-runner next` for a new/resumed run, or `workflow-runner continue` after request outputs are ready.
2. Read `response.status`.
3. If `response.status` is `done`, stop and report the completed result.
4. If `response.status` is `blocked`, stop and report the blocker.
5. If `response.status` is `needs_host_actions`, execute every request in `response.requests[]`; the runner may return one or many requests.
6. For each `run_worker` request, launch a fresh worker with the bootstrap below.
7. For each `wait_for_approval` request, ask Sergey/the user for the input described by the loaded request instructions. Despite the legacy action name, this is a generic user-input request, not only an approve/reject/block gate.
8. Capture one JSON host-output file per request.
9. Pass all host outputs back to `workflow-runner continue`.
10. Repeat from step 2.

## Host request rules

- Treat `response.requests[]` as the complete list of required host actions.
- Execute every request in the list before continuing.
- Do not run two `workflow-runner continue` commands concurrently for the same `<run-dir>`; the runner rejects same-run concurrent continues with a lock error. Collect all current outputs, then continue once.
- `run_worker` may appear more than once; run those workers in parallel when safe.
- `wait_for_approval` is also a host request; do not skip it, infer approval, or force it into a fixed approval envelope.
- User input for `wait_for_approval` may be an approval verdict, an option choice, or free-form text.
- Normalize the user answer into JSON that matches the request/step output contract. Examples: `{ "approval": "approved" }`, `{ "choice": "option_b" }`, `{ "answer": "free-form text" }`, or another shape required by the request instructions/schema.
- When request instructions provide options, a schema, field names, or routing rules, use them to normalize the answer.
- If the user answer is ambiguous for the requested output shape, ask a follow-up before continuing.
- Use each request `id`/`stepId` when naming outputs for multiple requests.
- Host-output files and paths are only transport for `workflow-runner continue`; do not treat them as business concepts.
- If a worker, user answer, or host-output file is missing, stop as blocked instead of guessing.

## Worker bootstrap template

```text
Load the step instructions by running:

<command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```
