---
name: orbita
description: Use Orbita for workflow-runner jobs when the user says /orbita, orbita, workflow-runner, run workflow, continue workflow, resume run, host actions, worker handoff, approval gate, asks to pick the right workflow, list available workflows, create/design a workflow, or drive a repository workflow through the runner CLI.
---

# Orbita

## Core contract

Orbita is the router-entrypoint for `workflow-runner`: route the user's request to catalog display, workflow resolution, new-run bootstrap, existing-run resume, or runner-directed host actions. After a run starts, the runner controls execution.

The orchestrator invokes public `workflow-runner` CLI commands with `--only-instructions` when the command supports it, then follows stdout text exactly.

The runner controls the agent by returning the next textual instruction or prompt from `workflow-runner next` and `workflow-runner continue`. Treat that instruction as authoritative. `workflow-runner write-output` only accepts or rejects one host request output; it is not a navigation command.

Treat runner stdout as a disposable active directive. Keep only the latest `workflow-runner next` or `workflow-runner continue --only-instructions` stdout as authoritative. Each new runner stdout replaces the previous active directive. Earlier runner stdout is stale context and must not be followed, merged, or used to decide the next action.

Never inspect or mutate private runtime files to decide what to do. Use only public run and runner commands from the skill root.

Orbita is a host adapter, not the task implementer. After a runner-directed host request exists:

- Execute only the current runner stdout and the exact commands embedded in it.
- Do not inspect task repository source, workflow source, runner `lib/**`, schemas, or CLI help to infer protocol or continue logic.
- Do not do independent research, implementation, or review for the user task while a worker owns the requested step.
- Do not reconstruct missing `write-output`, `continue`, or approval JSON from source code. If the latest stdout does not provide enough executable instruction to finish the host request, stop as blocked and report a runner contract bug.
- After spawning a worker, wait for that worker's accepted output or blocker before continuing the run.

## Routing model

Most Orbita branches overlap. Do not treat routing as durable modes. Classify only enough to choose the next public command:

- If the latest runner stdout is already active, follow that stdout. Do not inspect the workflow catalog.
- If the user only asks to list/show available workflows, run `node ./lib/entrypoints/cli/workflow-catalog.mjs list --human`, show the list, and stop.
- If the user asks to continue/resume/reclaim an existing run, list public run identities first. If no existing run fits and the user still wants work executed, create a new run through workflow resolution.
- Before creating any new run, resolve the workflow first, even when the user named a workflow.

## New-run workflow selection

Resolve the workflow before creating a new run. Do not create/register a run until the exact catalog `path` is known.

List available workflows by calling the public catalog command from this skill root:

```bash
node ./lib/entrypoints/cli/workflow-catalog.mjs list --json
```

Use only the catalog output's workflow `name`, top-level `description`, and `path` for preflight routing. Do not manually walk `../../workflows`, read private runtime state, or inspect `steps.*.input.prompt` to choose a workflow.

If the user gave an exact workflow path, use that path only after confirming it appears in the catalog. If the user gave a workflow name, alias, or fuzzy workflow name, resolve it through the public resolver command:

```bash
node ./lib/entrypoints/cli/workflow-catalog.mjs resolve '<workflow name or path>' --json
```

Use a single resolver match directly. If resolver returns multiple matches, ask the user to choose from those matches. If resolver returns no match, fall back to catalog-based task matching.

When the user did not name a workflow, rank catalog candidates from the task and workflow descriptions, then ask one selection question with at most three best candidates. Use `request_user_input` when available. Each candidate must be shown as `name - short reason`; the user may pick one candidate, ask to show all workflows, or type a workflow name/path manually. If the user replies with a fuzzy or partial workflow name, run `node ./lib/entrypoints/cli/workflow-catalog.mjs resolve '<workflow name or path>' --json`; if it still matches several candidates, ask one narrower selection question.

When no candidate fits, say that no existing workflow fits and offer to list workflows or create/design a new workflow if such a workflow exists in the catalog.

Catalog/list requests stop after showing catalog output unless the user also asked to run a workflow. Use `node ./lib/entrypoints/cli/workflow-catalog.mjs list --human` only when presenting the workflow list directly to the user.

## Bootstrap

Prepare a compact title, summary, owner, harness, session id, workflow identity, and dense user prompt in plain text.

List public run identities:

```bash
node ./lib/entrypoints/cli/workflow-runs.mjs list
```

Select an existing run only from public JSON fields such as `runId`, title, summary, workflow identity/path, status, timestamps, task key/fingerprint, and occupancy state. If exactly one candidate is clear, use its exact `runId`. If several are plausible, ask the user to choose by human-readable summaries. If a candidate is occupied, ask whether to wait, choose another run, or explicitly resolve the lease.

When no existing run fits, resolve the workflow through new-run workflow selection, then create/register one run identity:

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

For `run_worker`, choose the request instruction command before spawning or continuing the worker:

- Use `loadFollowupInstructionsCommand` only when the host can continue or restore the opaque `preferredAgentId`.
- Otherwise use `loadInstructionsCommand` for a fresh worker.
- After the actual worker id is known, run `bindAgentCommand` after replacing only the literal `<agent-id>` placeholder with the shell-quoted actual worker id.
- Treat `preferredAgentId` and `baton.workerBindings[stepId]` as advisory reuse hints only. Do not create attempt ids, agent objects, lifecycle/session registries, transcripts, or output state through this path.

Before spawning the worker, take the selected request instruction command. If it contains the literal `<lease-token>` placeholder, replace only that placeholder with the current exact lease token. Do not otherwise rewrite, shorten, shell-normalize, quote-normalize, explain, or enrich the command.

Spawn the worker with exactly this bootstrap prompt and nothing else. Do not prepend or append user prompt text, task context, hostile priors, role hints, workflow summaries, output-format reminders, metadata, watchdog text, or any other instructions.

The worker prompt must be exactly:

```text
Load the step instructions by running:

<selected request instruction command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```

Only `<request.loadInstructionsCommand>` may be substituted. The final spawned worker prompt must contain no other text.

Enforce the host watchdog for every `run_worker` request:

- Wait at most 10 minutes for the worker to return accepted output or a blocker.
- If the worker is still running, interrupt that same worker with a focused status request asking it to immediately run validating `write-output` or report the exact blocker.
- Wait at most 2 more minutes for that status request.
- If the worker still gives no accepted output or blocker, close that worker and retry the same current host request once with a fresh worker.
- If the retry also gives no accepted output or blocker within the same 10 minute plus 2 minute watchdog window, stop as blocked and report the hung worker/request ids.
- Do not use heartbeat as a substitute for this watchdog; worker bootstrap hangs must be detected before waiting out the run lease.

Workers use the validating `write-output` command from their loaded instructions. `write-output` returns only acceptance JSON or validation errors; it does not drive the orchestrator. Workers never call `continue`; the latest `next`/`continue` stdout instruction tells the orchestrator what to do next after current host requests finish.

If a worker needs user input before validated output, ask the user's focused question and forward the answer back into the same worker session. Do not create a replacement worker for that continuation, and do not let workers treat themselves as direct user-facing agents.

Do not run task-repository discovery, code reads, tests, implementation commands, or review commands in the parent session while a worker request is outstanding unless the current runner stdout explicitly requests that exact host action.

For `wait_for_approval`, the orchestrator handles the request directly. Follow the approval instruction in the latest runner stdout: it inlines the compiled approval prompt for the current request. Treat that compiled prompt as the complete source for the user-facing approval message, including workflow prompt, required-read files, projected baton state, output contract, and validating `write-output` command. Read and show any required approval context/artifacts before asking for a decision. Do not reduce the gate to a summary-only question. Normalize the user's answer to strict JSON and run the validating `write-output` command from the compiled prompt. Treat accepted output as completion of that host request, then continue following the latest `next`/`continue` stdout instruction.

Final answer only when stdout instruction explicitly says to stop and report `done` or `blocked`; use the terminal response JSON embedded in that stdout as the source of final result or blocker details.
