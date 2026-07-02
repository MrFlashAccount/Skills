---
name: orbita
description: Use Orbita for workflow-runner host-adapter jobs when the user says /orbita, orbita, workflow-runner, run/continue/resume a workflow-runner run, follow runner stdout, handle workflow-runner host actions, worker handoff, approval gate, list workflow-runner workflows, create/design a workflow-runner workflow, or drive a run through the runner CLI.
---

# Orbita

## Core contract

Orbita is the host adapter for `workflow-runner`: route catalog display, workflow resolution, new-run bootstrap, existing-run resume, and runner-directed host actions. After a run starts, the runner controls execution through `workflow-runner next` / `continue --only-instructions` stdout.

Hard rules:

- Latest runner stdout is the only active directive; each `next` or `continue --only-instructions` stdout supersedes all older runner stdout.
- Invoke public `workflow-runner` commands with `--only-instructions` when supported, then follow stdout exactly.
- `workflow-runner write-output` accepts or rejects one host request output only; it is not navigation.
- Use only public run/runner commands from the skill root. Do not inspect or mutate private runtime files, task repository source, workflow source, runner `lib/**`, schemas, or CLI help to infer protocol.
- Orbita is not the task implementer. While a worker owns a step, do not do independent research, implementation, review, or tests for that task.
- Execute only the current stdout and its embedded commands. Do not reconstruct missing `write-output`, `continue`, or approval JSON from source. If stdout lacks enough executable instruction, stop as blocked and report a runner contract bug.
- After spawning a worker, wait for that worker's accepted output or blocker before continuing the run.

## Routing model

Most Orbita branches overlap. Do not treat routing as durable modes. Classify only enough to choose the next public command:

- If the latest runner stdout is already active, follow that stdout. Do not inspect the workflow catalog.
- If the user only asks to list/show available workflows, run `node ./lib/entrypoints/cli/workflow-catalog.mjs list --human`, show the list, and stop.
- If the user asks to continue/resume/reclaim an existing run, list public run identities first. If no existing run fits and the user still wants work executed, create a new run through workflow resolution.
- Before creating any new run, resolve the workflow first, even when the user named a workflow.

## New-run workflow selection

Resolve the workflow before creating/registering a run. The only executable workflow path is an absolute catalog `path` returned by public catalog output.

List workflows:

```bash
node ./lib/entrypoints/cli/workflow-catalog.mjs list --json
```

Resolve a named, aliased, or fuzzy workflow:

```bash
node ./lib/entrypoints/cli/workflow-catalog.mjs resolve '<workflow name>' --json
```

Use workflow `name` and top-level `description` for routing; use `path` only after selection/resolution as `--workflow`. Do not walk `../../workflows`, read private runtime state, or inspect `steps.*.input.prompt` to choose.

Branch closure:

- Single resolver match: use it.
- Multiple resolver matches: ask the user to choose from those matches.
- No resolver match: rank catalog candidates from task and workflow descriptions.
- No named workflow: ask one selection question with at most three `name - short reason` candidates; use `request_user_input` when available. The user may pick one, ask for all workflows, or type a workflow name/alias. Resolve fuzzy replies again.
- No candidate fits: say so and offer to list workflows or create/design a workflow if that exists in the catalog.
- List-only requests stop after `node ./lib/entrypoints/cli/workflow-catalog.mjs list --human` unless the user also asked to run a workflow.
- Never accept user-typed workflow paths as executable paths.

## Bootstrap

Prepare compact title, summary, owner, harness, session id, and dense user prompt. List public run identities:

```bash
node ./lib/entrypoints/cli/workflow-runs.mjs list
```

Select an existing run only from public fields: `runId`, title, summary, workflow identity/path, status, timestamps, task key/fingerprint, and occupancy. If exactly one candidate fits, use its exact `runId`; if several fit, ask by human-readable summary; if occupied, ask whether to wait, choose another run, or explicitly resolve the lease.

If no run fits, resolve the workflow, then create/register one run identity:

```bash
node ./lib/entrypoints/cli/workflow-runs.mjs create --workflow <absolute-catalog-workflow-path> --title '<title>' --summary '<summary>' --owner <owner> --harness <harness> --session-id <session-id>
```

Never pass repo-relative workflow paths such as `workflows/.../workflow.json` into `workflow-runs create` or runner `--workflow` commands. If a relative workflow path error appears, rerun `workflow-catalog resolve`/`list` and use the returned absolute catalog `path`; do not guess cwd or repair the path manually.

Claim the selected run before calling the runner:

```bash
lease_token=$(node ./lib/entrypoints/cli/workflow-runs.mjs claim --run-id <run-id> --owner <owner> --harness <harness> --session-id <session-id> --print-lease-token)
```

Extract and preserve exact `runId` and `lease_token`; never invent, shorten, or retype the token from memory. If missing, claim again or stop blocked.

Start by asking the runner for the first instruction:

```bash
node ./lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> --user-prompt '<clear dense user task prompt>' --lease-token "$lease_token" --only-instructions
```

Follow stdout text exactly.

## Command-driven execution

After each `--only-instructions` runner command, follow stdout exactly. `instructions` prints loaded instruction text and never accepts `--only-instructions`.

- `done`: stop and report the completed result from terminal stdout JSON, extracting workflow-specific result from included baton/projection, not a presumed `result` field.
- `blocked`: stop and report blocker details from terminal stdout JSON, extracting from included baton/projection, not a presumed `blocker` field.
- `needs_host_actions`: complete every current inline JSON request through Host actions, wait until each requested action has accepted output, then run the exact embedded `continue` command.

Call `workflow-runner continue` only from the latest stdout command. Do not call `next` as a substitute, and never report cursor, next instruction, pending request, accepted output, or `needs_host_actions` as final completion.

## Host actions

Complete every current stdout request unless impossible; if any required request cannot be completed, stop blocked. Known actions: `run_worker`, `wait_for_approval`. Unknown action means blocked.

For `run_worker`:

- Use `loadFollowupInstructionsCommand` only when the host can continue or restore the opaque `preferredAgentId`.
- Otherwise use `loadInstructionsCommand` for a fresh worker.
- Before dispatching to the worker, take the selected command. If it contains literal `<lease-token>`, replace only that placeholder with the exact current lease token. Do not otherwise rewrite, shorten, shell-normalize, quote-normalize, explain, or enrich it.
- Dispatch to the selected worker: continue/restore `preferredAgentId` when using `loadFollowupInstructionsCommand`; otherwise spawn a fresh worker. Send exactly this prompt and no added user prompt, task context, role hints, output rules, metadata, watchdog text, or other instructions:

```text
Load the step instructions by running:

<selected request instruction command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```

- Only the selected request instruction command may be substituted. The final worker prompt must contain no other text.
- After the actual worker id is known, run `bindAgentCommand` after replacing only literal `<agent-id>` with the shell-quoted actual worker id.
- Treat `preferredAgentId` and `baton.workerBindings[stepId]` as advisory reuse hints only; do not create attempt ids, agent objects, lifecycle/session registries, transcripts, or output state.
- Workers use the validating `write-output` command from loaded instructions. `write-output` returns acceptance JSON or validation errors only; workers never call `continue`.
- If a worker needs user input before validated output, ask the focused question and forward the answer into the same worker session. Do not replace that worker or let workers treat themselves as direct user-facing agents.
- Do not run task-repository discovery, code reads, tests, implementation, or review commands in the parent while a worker request is outstanding unless stdout explicitly requests that exact host action.

`run_worker` watchdog:

- Treat bootstrap/instruction-load silence separately from active implementation progress. If instructions cannot load, or the worker stays silent before showing concrete progress, use the existing bounded startup path: wait at most 10 minutes, interrupt that same worker with a focused status request, then wait at most 2 more minutes.
- Concrete active implementation progress must name current work, inspected or changed surfaces, verification state, and the next bounded checkpoint. Generic reassurance, heartbeat, or "still working" is not enough evidence.
- If the same worker returns concrete active implementation progress evidence, continue that same worker and ask for the next bounded checkpoint instead of forcing immediate terminal `write-output`.
- If the worker gives vague status, misses a checkpoint, or cannot show progress evidence, ask it to immediately run validating `write-output` or report the exact blocker.
- If the worker still gives no accepted output, concrete progress evidence, or blocker after the bootstrap/status-pressure window, close that worker and retry the same current host request once with a fresh worker.
- If the retry also gives no accepted output, concrete progress evidence, or blocker within the same 10 minute plus 2 minute watchdog window, stop as blocked and report the hung worker/request ids.
- Do not use heartbeat as a substitute for this watchdog; worker bootstrap hangs must be detected before waiting out the run lease. Do not persist progress in baton, scrape transcripts, read private runner state, or add durable worker status storage.

For `wait_for_approval`, the orchestrator handles the request directly from the latest stdout compiled approval prompt. Treat that prompt as the complete user-facing source: workflow prompt, required-read files, prompt input context, output contract, and validating `write-output` command.

Before asking for a decision, read and show required approval context/artifacts and attach required-read files or prompt input artifact paths through the host/platform approval mechanism. In Codex/Codex Desktop, attach each listed local artifact as a Markdown file link with an absolute target, for example `[reasons-canvas-research.md](/absolute/path/reasons-canvas-research.md)`; a plain path, artifact id, or summary is not an attachment. Do not replace attachments with summaries, plain paths, or inline full artifact bodies. If attachment/link rendering is unavailable, state that capability gap and name the affected path/reference.

Do not reduce approval to a summary-only question. When user approval/input blocks the next step, put the full approval/request message in final, not commentary, and do not send a separate short final. Normalize the user's answer to strict JSON, run the validating `write-output` command from the compiled prompt, treat accepted output as request completion, then continue from the latest stdout instruction.

Final answer only when stdout instruction explicitly says to stop and report `done` or `blocked`; use the terminal response JSON embedded in that stdout as the source of final result or blocker details.
