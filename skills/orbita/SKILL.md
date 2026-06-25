---
name: orbita
description: Use Orbita for workflow-runner jobs when the user says /orbita, orbita, workflow-runner, run workflow, continue workflow, resume run, host actions, worker handoff, approval gate, or asks to drive a repository workflow through the runner CLI.
---

# Orbita

## Core contract

The orchestrator invokes public `workflow-runner` CLI commands with `--only-instructions` when the command supports it, then follows stdout text exactly.

The runner controls the agent by returning the next textual instruction or prompt from `workflow-runner next` and `workflow-runner continue`. Treat that instruction as authoritative. `workflow-runner write-output` only accepts or rejects one host request output; it is not a navigation command.

Treat runner stdout as a disposable active directive. Keep only the latest `workflow-runner next` or `workflow-runner continue --only-instructions` stdout as authoritative. Each new runner stdout replaces the previous active directive. Earlier runner stdout is stale context and must not be followed, merged, or used to decide the next action.

Never inspect or mutate private runtime files to decide what to do. Use only public run and runner commands from the skill root.

## Bootstrap

Prepare a compact title, summary, owner, harness, session id, workflow identity, and dense user prompt in plain text.

List public run identities:

```bash
node ./lib/entrypoints/cli/workflow-runs.mjs list
```

Select an existing run only from public JSON fields such as `runId`, title, summary, workflow identity/path, status, timestamps, task key/fingerprint, and occupancy state. If exactly one candidate is clear, use its exact `runId`. If several are plausible, ask the user to choose by human-readable summaries. If a candidate is occupied, ask whether to wait, choose another run, or explicitly resolve the lease.

When no existing run fits, create/register one run identity:

```bash
node ./lib/entrypoints/cli/workflow-runs.mjs create --workflow <workflow> --title '<title>' --summary '<summary>' --owner <owner> --harness <harness> --session-id <session-id>
```

Claim the selected run before calling the runner:

```bash
lease_token=$(node ./lib/entrypoints/cli/workflow-runs.mjs claim --run-id <run-id> --owner <owner> --harness <harness> --session-id <session-id> --print-lease-token)
```

Extract and preserve the exact `runId` and exact `lease_token`. Never invent, shorten, or retype the token from memory. If the token is missing, claim again or stop with a blocker.

Start by asking the runner for the first instruction:

```bash
node ./lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> --user-prompt '<clear dense user task prompt>' --lease-token "$lease_token" --only-instructions
```

Follow stdout text exactly.

## Command-driven execution

After each runner command that uses `--only-instructions`, follow stdout text exactly. `instructions` prints loaded instruction text and does not accept `--only-instructions`.

Terminal statuses:

- `done`: stop and report the completed result from the terminal response JSON in stdout.
- `blocked`: stop and report the blocker from the terminal response JSON in stdout.

Non-terminal host work:

- `needs_host_actions`: complete every current host request from the inline JSON request array in stdout text through the host actions below, wait until each requested action has accepted output, then run the exact `continue` command embedded in the stdout instruction.

Call `workflow-runner continue` only by running the exact command embedded in the latest stdout instruction.

Do not call `next` as a substitute for applying accepted request results. Do not report an intermediate cursor, next instruction, pending request, accepted output, or `needs_host_actions` as final completion.

## Host actions

A host action is work requested by the runner in stdout instruction text. Complete every current request unless one is impossible; if any required request cannot be completed, stop as blocked.

Known request actions:

- `run_worker`: run the requested worker as a subagent.
- `wait_for_approval`: collect the requested approval, option choice, or free-form user input.

If a request action is unknown, stop as blocked.

For `run_worker`, load the request instructions by embedding the request's exact `loadInstructionsCommand` in the worker bootstrap. If the command contains a `<lease-token>` placeholder, replace only that placeholder:

```text
Load the step instructions by running:

<request.loadInstructionsCommand>

Then follow the loaded instructions exactly.
If the instructions cannot be loaded, stop with an error.
```

Workers use the validating `write-output` command from their loaded instructions. `write-output` returns only acceptance JSON or validation errors; it does not drive the orchestrator. Workers never call `continue`; the latest `next`/`continue` stdout instruction tells the orchestrator what to do next after current host requests finish.

If a worker needs user input before validated output, ask the user's focused question and forward the answer back into the same worker session. Do not create a replacement worker for that continuation, and do not let workers treat themselves as direct user-facing agents.

For `wait_for_approval`, load the request instructions via the exact `loadInstructionsCommand` from the request JSON, read the requested question/options and required JSON shape, ask only for that input, normalize the answer to strict JSON, and run the exact validating `write-output` command from the loaded instructions. Treat accepted output as completion of that host request, then continue following the latest `next`/`continue` stdout instruction.

Final answer only when stdout instruction explicitly says to stop and report `done` or `blocked`; use the terminal response JSON embedded in that stdout as the source of final result or blocker details.
