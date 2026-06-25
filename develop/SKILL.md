---
name: develop-workflow-runtime
description: Use for running a workflow from the repo root through workflow-runner host requests, bounded workers, and user-input waits.
---

# Workflow Runtime

## Core contract

The orchestrator does not own workflow control. It invokes the appropriate public `workflow-runner` CLI command, parses stdout JSON, and strictly follows the returned `stdout.orchestratorInstruction`.

The runner controls the agent by returning the next textual instruction or prompt. Treat that instruction as authoritative after every successful `workflow-runner next`, `workflow-runner write-output`, and `workflow-runner continue`.

Never inspect or mutate private runtime files to decide what to do. Use only public run and runner commands from the repo root.

## Bootstrap

Prepare a compact title, summary, owner, harness, session id, workflow identity, and dense user prompt in plain text.

List public run identities:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs list
```

Select an existing run only from public JSON fields such as `runId`, title, summary, workflow identity/path, status, timestamps, task key/fingerprint, and occupancy state. If exactly one candidate is clear, use its exact `runId`. If several are plausible, ask the user to choose by human-readable summaries. If a candidate is occupied, ask whether to wait, choose another run, or explicitly resolve the lease.

When no existing run fits, create/register one run identity:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs create --workflow <workflow> --title '<title>' --summary '<summary>' --owner <owner> --harness <harness> --session-id <session-id>
```

Claim the selected run before calling the runner:

```bash
lease_token=$(node develop/lib/entrypoints/cli/workflow-runs.mjs claim --run-id <run-id> --owner <owner> --harness <harness> --session-id <session-id> --print-lease-token)
```

Extract and preserve the exact `runId` and exact `lease_token`. Never invent, shorten, or retype the token from memory. If the token is missing, claim again or stop with a blocker.

Start by asking the runner for the first instruction:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> --user-prompt '<clear dense user task prompt>' --lease-token "$lease_token"
```

Parse stdout JSON and follow `stdout.orchestratorInstruction`.

## Command-driven execution

After each runner command, parse stdout JSON before acting. `stdout.orchestratorInstruction` is the control surface; `status` is supporting state.

Terminal statuses:

- `done`: stop and report the completed result.
- `blocked`: stop and report the blocker.

Non-terminal host work:

- `needs_host_actions`: satisfy the current `stdout.requests[]` through the host actions below, submit accepted outputs through validating `workflow-runner write-output`, then follow the new stdout `orchestratorInstruction`.

Call `workflow-runner continue` only when the latest `orchestratorInstruction` says the current accepted request results should be continued:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> --lease-token "$lease_token"
```

Do not call `next` as a substitute for applying accepted request results. Do not report an intermediate cursor, next instruction, pending request, accepted output, or `needs_host_actions` as final completion.

## Host actions

A host action is work requested by the runner in `stdout.requests[]`. Complete every current request unless one is impossible; if any required request cannot be completed, stop as blocked.

Known request actions:

- `run_worker`: run the requested worker as a subagent.
- `wait_for_approval`: collect the requested approval, option choice, or free-form user input.

If a request action is unknown, stop as blocked.

For `run_worker`, load the request instructions by embedding the request's exact `loadInstructionsCommand` in the worker bootstrap, replacing only the `<lease-token>` placeholder:

```text
Load the step instructions by running:

<request.loadInstructionsCommand with <lease-token> replaced>

Then follow the loaded instructions exactly.

The loaded instructions include the validating write-output command. Use that exact command; supply only the required JSON body/stdin. If validation fails, fix the JSON and retry boundedly until accepted. On success, return the exact write-output stdout JSON to the orchestrator.

Do not add behavior, role, output format, or constraints beyond the loaded instructions. If the instructions cannot be loaded, stop with an error.
```

Workers use the validating `write-output` command from their loaded instructions. Workers never call `continue`. The orchestrator parses the worker's returned `write-output` stdout JSON and follows its `orchestratorInstruction`.

If a worker needs user input before validated output, ask the user's focused question and forward the answer back into the same worker session. Do not create a replacement worker for that continuation, and do not let workers treat themselves as direct user-facing agents.

For `wait_for_approval`, load the request instructions via `request.loadInstructionsCommand`, read the requested question/options and required JSON shape, ask only for that input, normalize the answer to strict JSON, and submit it through the validating `write-output` command from the loaded instructions. Then parse stdout JSON and follow its `orchestratorInstruction`.

Final answer only when parsed stdout has terminal `status: done` or `status: blocked`, or when `orchestratorInstruction` explicitly says to stop.
