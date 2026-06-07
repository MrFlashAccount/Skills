---
name: develop-workflow-runtime
description: Use for running a workflow from the repo root through workflow-runner host requests, bounded workers, and user-input waits.
---

# Workflow Runtime

## Core rule

Drive the workflow only through `workflow-runner`. The runner owns transitions, validates request results, and persists accepted state. The orchestrator executes host actions, then continues exactly once per response batch.

Never inspect or mutate private runtime files to decide the next step. Use public run and runner commands from the repo root.

## 1. Understand the user task

Prepare a compact title, summary, and user prompt in plain text. Do not create prompt files.

Use the title/summary to identify or create the public run identity. Keep the user prompt ready for runner startup commands that explicitly include `--user-prompt`.

## 2. Select or create run identity

### 2.1 List existing runs

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs list
```

Match candidates by public JSON fields: `runId`, title, summary, workflow identity/path, status, timestamps, task key/fingerprint, and occupancy state. Do not ask the user to choose by private paths or hidden metadata.

### 2.2 Choose or create one run identity

- Exactly one clear candidate: select its exact `runId`.
- Multiple plausible candidates: ask the user to choose using human-readable summaries.
- Occupied candidate: do not attach blindly; ask whether to wait, choose another run, or explicitly resolve the lease.
- Stale candidate: it may be reclaimed in step 3.
- No candidate: create/register one run identity now.

Create/register command:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs create --workflow <workflow> --title '<title>' --summary '<summary>' --owner <owner> --harness <harness> --session-id <session-id>
```

Do not claim in step 2.

## 3. Claim selected run

Claim the chosen `runId` after selection:

```bash
lease_token=$(node develop/lib/entrypoints/cli/workflow-runs.mjs claim --run-id <run-id> --owner <owner> --harness <harness> --session-id <session-id> --print-lease-token)
```

Extract and remember the exact `runId` and exact `lease_token`. Never invent, shorten, or retype the token from memory. If the token is missing, claim again or stop with a blocker.

## 4. Enter runner loop

Start the runner loop with the clear, dense user task prompt:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> --user-prompt '<clear dense user task prompt>' --lease-token "$lease_token"
```

## 5. Handle runner response

Read `response.status`.

- `done`: stop and report the completed result.
- `blocked`: stop and report the blocker.
- `needs_host_actions`: read every item in `response.requests[]`, then go to step 6. Do not continue here.

Do not call `next` as a substitute for applying accepted request results.

## 6. Execute every request in `response.requests[]`

A request is a host action required by the runner. Complete every request from the current response before continuing.

Known statuses/outcomes:

- `done`: completed result.
- `blocked`: blocker.
- `needs_host_actions`: host requests are present in `response.requests[]`.

Known request actions:

- `run_worker`: Run the requested worker as a subagent.
- `wait_for_approval`: collect the requested user input; despite the name, it can be approval, option choice, or free-form text.

Rules:

- If a request action is unknown, stop as blocked/fail explicitly.
- If any request cannot be completed, stop as blocked.
- Parallel branches are a simple batch: complete all requests in the current response, then continue once. Workflows that branch in parallel must have a direct join before continuing past the batch.

### 6.1 Handle `run_worker`

Start the worker with the instruction-loading command embedded directly in the bootstrap. Replace placeholders before sending:

```text
Load the step instructions by running:

node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id <run-id> --step-id <step-id> --lease-token "<lease_token>"

Then follow the loaded instructions exactly.

The loaded instructions include the validating write-output command. Use that exact command; supply only the required JSON body/stdin. If validation fails, fix the JSON and retry boundedly until accepted.

Do not call workflow-runner continue. Do not create output files. Do not add behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error.
```

The orchestrator waits until the worker finishes its work. Workers never call `continue`.

If a worker announces that it needs clarification instead of final validated output, treat it as an orchestrator-mediated clarification request: ask the user the worker's focused question, then forward the user's answer back into the same worker/subagent session with `sessions_send` so the worker continues there. This same clarification-session continuation is allowed; do not use it as persistent worker reuse across workflow loop iterations, and do not let workers pretend they can ask the user directly.

### 6.2 Handle `wait_for_approval` / user input

1. Load the request instructions to read the requested question/prompt and the required answer shape/schema.
2. Read the requested question, options if present, and required JSON shape before asking anything.
3. Ask the user only for the requested input.
4. If user input is missing, or the answer is ambiguous for the required JSON shape, ask one focused follow-up.
5. Normalize the answer to strict JSON matching the instructions.
6. Submit it through the validating `write-output` command from the loaded instructions.

Keep deeper approval/user-input back-and-forth as a TODO/follow-up; do not invent extra interaction rules here.

## 7. Continue

After every request from the current response has completed successfully, call `continue` once with only run authority args:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> --lease-token "$lease_token"
```

`continue` reads accepted request results from baton/state and returns the next runner response.

## 8. Repeat

Return to step 5 with the response from `continue`. Continue until `done` or `blocked`.

## 9. Reference commands

List public runs:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs list
```

Create/register a run identity:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs create --workflow <workflow> --title '<title>' --summary '<summary>' --owner <owner> --harness <harness> --session-id <session-id>
```

Claim a run:

```bash
lease_token=$(node develop/lib/entrypoints/cli/workflow-runs.mjs claim --run-id <run-id> --owner <owner> --harness <harness> --session-id <session-id> --print-lease-token)
```

Next:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> --user-prompt '<clear dense user task prompt>' --lease-token "$lease_token"
```

Load request instructions:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id <run-id> --step-id <step-id> --lease-token "$lease_token"
```

Write accepted request result:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs write-output --run-id <run-id> --step-id <step-id> --lease-token "$lease_token" <<'JSON'
{ "outcome": "ready" }
JSON
```

Continue:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> --lease-token "$lease_token"
```
