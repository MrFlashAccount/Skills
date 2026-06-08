---
name: develop-workflow-runtime
description: Use for running a workflow from the repo root through workflow-runner host requests, bounded workers, and user-input waits.
---

# Workflow Runtime

## Core rule

Drive the workflow only through `workflow-runner`. The runner owns transitions, validates request results, and persists accepted state. The orchestrator executes host actions, then continues exactly once per response batch. A run is complete only when `workflow-runner continue` returns `status: done` or `status: blocked`.

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
- `needs_host_actions`: internal instruction only; execute every request in `response.requests[]`, then call `workflow-runner continue` exactly once.

Do not call `next` as a substitute for applying accepted request results. Do not report an intermediate cursor, next step, pending request, or `needs_host_actions` as completion; that is a protocol violation. If unsure whether to continue, continue.

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
- Stop only on `done`, `blocked`, a required host action that cannot be completed, or explicit user input/approval required by a host action that cannot be inferred.
- Parallel branches are a simple batch: complete all requests in the current response, then continue once. Workflows that branch in parallel must have a direct join before continuing past the batch.

### 6.1 Handle `run_worker`

Start the worker with the instruction-loading command embedded directly in the bootstrap. Replace placeholders before sending:

```text
Load the step instructions by running:

node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id <run-id> --step-id <step-id> --lease-token "<lease_token>"

Then follow the loaded instructions exactly.

The loaded instructions include the validating write-output command. Use that exact command; supply only the required JSON body/stdin. If validation fails, fix the JSON and retry boundedly until accepted.

Do not add behavior, role, output format, or constraints beyond the loaded instructions. If the instructions cannot be loaded, stop with an error.
```

The orchestrator waits until the worker finishes its work. Workers never call `continue`.

If a worker announces that it needs user input instead of final validated output, treat it as an orchestrator-mediated worker user request, not only a narrow clarification: ask the user the worker's focused user-facing request, then forward the user's answer back into the same worker/subagent session with `sessions_send` so the worker continues there. This same worker-request session continuation is allowed; do not create a new subagent/session for that continuation, do not use it as persistent worker reuse across workflow loop iterations, and do not let workers pretend they can ask the user directly.

If the user asks for a workflow proposal/artifact file, hand off only an existing workflow artifact reference from the current runner response, persisted `last-response`, baton state/output, or the worker's validated last output. Use the artifact metadata exactly as emitted by the workflow, especially `{producerStepId, artifact.id, artifact.path}` or the producing step's `artifacts[]` entry. Do not ask a worker to create a new temp file, side-channel proposal, or arbitrary artifact outside the workflow output contract. If no workflow artifact ref/path exists, report a blocker and the missing artifact ref instead of creating a replacement file.

### 6.2 Handle `wait_for_approval` / user input

1. Load the request instructions to read the requested question/prompt, approval/input materials, artifact refs, allowed decisions/options, and required answer shape/schema.
2. The workflow-orchestrator/host adapter owns the user-facing formulation of the approval/input request. Do not ask a worker to recreate or rephrase the approval packet by default; use the existing artifacts/materials and orchestrator wording.
3. Present the handoff as two explicit blocks:
   - `User message` / `Message to user`: clean natural text to send to the human. Include what is being approved or answered, the relevant artifact paths/refs/materials, natural choices instead of raw approval enum names as the primary options (`ok`, `LGTM`, `подтверждаю`, or equivalent clear approval means proceed/approved; requested changes, corrections, constraints, or questions mean revise/rejected with notes for the relevant step; explicit stop/cancel/block means blocked), and one clear question in natural language. Do not mention internal session routing, session keys, or same-orchestrator/session continuation in this user-facing block.
   - `Parent/main routing note` / `Parent-only routing`: internal note for the parent/main agent only. Explicitly say: do not forward this note to the user; after the user answers, send the answer back to the same workflow-orchestrator subagent/session/run so this existing run can normalize the answer and continue; do not start a new workflow-orchestrator/subagent for that answer. Include the current workflow run id and, when available from runtime context, enough session identity/context to route correctly, such as the actual session key; do not invent unavailable IDs.
4. Stop and wait for the actual parent/user decision in the same workflow-orchestrator subagent/session/run when applicable. Missing approval/input in the current subagent/session is `pending_user_approval`, not `blocked`.
5. MUST NOT call `workflow-runner write-output` for this step until the parent/user decision exists and can be normalized from natural language to the required JSON shape.
6. After the user responds, normalize the decision to strict approval JSON matching the instructions, then submit it through the validating `write-output` command from the loaded instructions.
7. Use `approval=blocked` only when the parent/user explicitly blocks/cancels, or when the approval/input materials cannot be loaded or presented.

Keep deeper approval/user-input back-and-forth as a TODO/follow-up; do not invent extra interaction rules here.

## 7. Continue

After every request from the current response has completed successfully, call `continue` once with only run authority args:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> --lease-token "$lease_token"
```

`continue` reads accepted request results from baton/state and returns the next runner response.

## 8. Repeat

Return to step 5 with the response from `continue`. Continue until `done` or `blocked`. Final answer only after `done`/`blocked`; otherwise keep driving the runner.

## 9. Final reminder

You MUST keep driving the loop until `workflow-runner continue` returns `status: done` or `status: blocked`, or until a `wait_for_approval` host action has been presented as a concise human-facing request and is pending parent/user approval/input with no approval output written yet. `needs_host_actions` is never final; execute its requests and continue unless the allowed stop is pending parent/user approval/input. If unsure whether to continue, continue. MUST NOT report an intermediate cursor, next step, pending request, or `needs_host_actions` as final completion. Only final-answer after terminal `done`/`blocked` or an explicit allowed stop condition already described above.
