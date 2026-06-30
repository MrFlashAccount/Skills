# Workflow Runner Host Adapter Boundary

## Status

Draft shape for architecture review.

## Boundary

Deterministic code owns the workflow loop:

- start or resume a run;
- render the current step prompt;
- return host action requests;
- apply host outputs already accepted by the validating writer;
- persist baton state and history;
- repeat until another host action is needed or the workflow reaches `done` / `blocked`.

The host adapter is thin. It executes requests with whatever capabilities the environment provides, writes each host action result through the runner's validating writer, and calls the runner again after outputs are accepted. It does not choose transitions.

## Runner commands

```bash
node ./lib/entrypoints/cli/workflow-runner.mjs next --lease-token <token> --run-id <run-id> [--workflow <workflow.json>] [--user-prompt <text> | --user-prompt-file <path>]
node ./lib/entrypoints/cli/workflow-runner.mjs write-output --lease-token <token> --run-id <run-id> --step-id <id> [--json <json>] [--workflow <workflow.json>]
node ./lib/entrypoints/cli/workflow-runner.mjs continue --lease-token <token> --run-id <run-id> [--workflow <workflow.json>]
node ./lib/entrypoints/cli/workflow-runner.mjs instructions [--follow-up] --run-id <run-id> --step-id <id> --lease-token <token>
node ./lib/entrypoints/cli/workflow-runner.mjs bind-agent --run-id <run-id> --step-id <id> --agent-id <agent-id> --lease-token <token>
```

`next` and `continue` also accept `--only-instructions`; with that flag stdout is exactly the `orchestratorInstruction` text instead of the full JSON host response. `next` creates the run files if needed and returns the current host work. `write-output` validates and accepts one current request output directly into baton/state, then returns only acceptance JSON or validation errors; it does not accept `--only-instructions`, does not drive orchestrator navigation, and must not accept or mutate worker binding metadata. `continue` applies already-accepted outputs from baton/state, persists the new baton, and returns the next host work. `instructions` prints only the compiled instructions for one current requested step, does not accept `--only-instructions`, and fails for unknown or unsafe step ids. `bind-agent` validates the same explicit lease and updates only top-level `baton.workerBindings[stepId]` with the supplied opaque worker id. Current requests and instructions are rendered from the indexed workflow plus `baton.json`; durable runner state is baton plus history plus advisory top-level worker bindings. Every write-capable, bind-capable, or instruction-loading command validates a fresh explicit `--lease-token` before creating run directories, locks, index entries, baton/history, binding metadata, or durable commit files; `runId` is identity only, and durable lease state keeps only token hash, token epoch, and lease expiry.

Commands returned in host responses are rendered with the absolute path to `workflow-runner.mjs` and an explicit absolute `--runs-root`, quoted for shell execution, so a worker or host can run them from any current working directory. The relative examples above are only for humans running the CLI from the skill root.

### Startup user prompt

When starting a new run, `next` may receive the raw startup user prompt with `--user-prompt` or `--user-prompt-file`. The runner stores it once as top-level `baton.user_prompt`. Existing runs are resumed as-is: later `next` calls do not overwrite `baton.user_prompt`, and `continue` preserves it while advancing the baton.

At run initialization, the runner deterministically selects and persists `baton.user_prompt_target` from the static startup topology. A target is stable only when all possible startup paths that can be chosen before the first worker guarantee the same worker target; static fanout may pin one rendered worker branch, but ambiguous dynamic transitions, divergent `match/cases`, and terminal/no-worker `match/cases` branches fail loudly instead of accepting a prompt that might be unused.

The runner/interpreter injects the startup prompt only into the render context for the persisted `baton.user_prompt_target` until that selected worker's output is applied. Rendering validates that the saved target is still defined, is still a worker, and is present whenever the current response renders workers or reaches a terminal step; otherwise the runner fails rather than silently dropping `baton.user_prompt`. It persists `baton.user_prompt_injected: true` only when applying that selected worker output, so a crash or repeated `next` before completion keeps the prompt in that same worker's instructions, while resume or workflow-shape drift after completion cannot reinject it into a later worker. The template compiler only renders a `## User prompt` section for worker steps when that render-time value is passed; it does not decide eligibility itself. `workflow.start` may be a control step; approval/user-gate answers are separate host interactions, not startup `user_prompt`, and later workers do not receive this section unless the workflow explicitly carries derived context through normal state/output paths.

## Host request response

When host work is needed, the runner returns:

```json
{
  "status": "needs_host_actions",
  "orchestratorInstruction": "Supersedes all previous workflow-runner stdout.\nExecute every host request in this JSON and wait until all requested actions finish: [{\"id\":\"step_id\",\"stepId\":\"step_id\",\"action\":\"run_worker\",\"preferredAgentId\":null,\"loadInstructionsCommand\":\"node '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' instructions --run-id 'run_id' --step-id 'step_id' --runs-root '/absolute/path/to/.workflow-runs' --lease-token <lease-token>\",\"loadFollowupInstructionsCommand\":\"node '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' instructions --follow-up --run-id 'run_id' --step-id 'step_id' --runs-root '/absolute/path/to/.workflow-runs' --lease-token <lease-token>\",\"bindAgentCommand\":\"node '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' bind-agent --run-id 'run_id' --step-id 'step_id' --runs-root '/absolute/path/to/.workflow-runs' --agent-id <agent-id> --lease-token <lease-token>\"}]\nThen run:\nnode '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' continue --run-id 'run_id' --runs-root '/absolute/path/to/.workflow-runs' --lease-token <lease-token> --only-instructions\nFollow that stdout instruction exactly.",
  "baton": {},
  "requests": [
    {
      "id": "step_id",
      "stepId": "step_id",
      "action": "run_worker",
      "preferredAgentId": null,
      "loadInstructionsCommand": "node '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' instructions --run-id 'run_id' --step-id 'step_id' --runs-root '/absolute/path/to/.workflow-runs' --lease-token <lease-token>",
      "loadFollowupInstructionsCommand": "node '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' instructions --follow-up --run-id 'run_id' --step-id 'step_id' --runs-root '/absolute/path/to/.workflow-runs' --lease-token <lease-token>",
      "bindAgentCommand": "node '/absolute/path/to/skills/orbita/lib/entrypoints/cli/workflow-runner.mjs' bind-agent --run-id 'run_id' --step-id 'step_id' --runs-root '/absolute/path/to/.workflow-runs' --agent-id <agent-id> --lease-token <lease-token>"
    }
  ]
}
```

`orchestratorInstruction` is a machine-visible directive for the host/orchestrator. Runner stdout is an active directive, not durable history: each new `next` or `continue --only-instructions` stdout supersedes every previous runner stdout. When `status` is `needs_host_actions`, the host must treat the response as non-terminal: finish every request in the inline JSON request array, run the embedded `continue --only-instructions` command, and follow the next directive returned by runner stdout. `run_worker` requests are executed by starting or restoring a worker/subagent with a command string selected from the request: use `loadFollowupInstructionsCommand` only when the host can continue or restore the opaque `preferredAgentId`, otherwise use `loadInstructionsCommand` for a fresh worker. The selected command is embedded in the strict worker bootstrap and watchdog policy from `skills/orbita/SKILL.md`; the full bootstrap text intentionally lives in the skill instead of every runner response. After the host knows the actual selected worker id, it runs `bindAgentCommand` after replacing only the literal `<agent-id>` placeholder with the shell-quoted worker id; this writes only `baton.workerBindings[stepId]` and does not use `write-output`. `wait_for_approval` requests are executed by the orchestrator itself; approval requests must not carry `preferredAgentId`, `bindAgentCommand`, or `loadFollowupInstructionsCommand`. The runner stdout inlines the compiled approval prompt for each current approval request, and the orchestrator uses that prompt as the complete source for the user-facing approval message, including required-read files, prompt input context, prompt input artifact required-read paths when present, workflow step prompt, output contract, and validating writer command. When required-read files or prompt input artifact paths are present, the host must attach those files through the approval mechanism instead of replacing them with summaries or inline full artifact bodies; if attachment/linking is unavailable, the approval message must state that capability gap and name the affected path/reference. Only `done` and `blocked` are terminal; terminal `--only-instructions` stdout includes minified terminal response JSON with `status` and `baton` so the host has final result or blocker details without falling back to full JSON mode.

Runner stdout commands include the explicit lease token when the runner was called with one. If a runner-returned command still contains a `<lease-token>` placeholder, hosts must substitute the fresh explicit lease token before executing it; the runner does not read a token from environment variables.

The public host request contract is intentionally narrow: requested action identity and step identity are always public. `run_worker` requests additionally expose only `loadInstructionsCommand`, `loadFollowupInstructionsCommand`, `bindAgentCommand`, and `preferredAgentId`; they must not expose `attemptId`, agent objects, lifecycle state, session registries, transcripts, output paths, or other control-plane metadata. `preferredAgentId` is either an opaque worker id from top-level `baton.workerBindings[stepId]` or `null` when no binding exists. Approval requests may additionally include output-schema metadata when the workflow step declares `output.schema`, but must not include worker reuse fields. `outputSchema` is the raw workflow reference. `resolvedOutputSchema` is the preferred host-adapter contract when present: it contains `{ ref, schema }`, where `ref` is the same raw workflow reference and `schema` is the JSON payload describing the normalized answer expected back from the host. Neither field exposes runner filesystem paths. Instruction storage paths are private runner state. Output paths are not part of the request contract.

Terminal statuses are:

- `done`
- `blocked`

A CLI failure is an execution error and should be reported by the host adapter instead of forcing a workflow transition.

## Output capture

The host wrapper writes each request result through `workflow-runner write-output`. The command validates strict JSON against the current request/step output schema and accepts the normalized value directly into baton/state. It is a pure task-output path: it must not accept, store, emit, or mutate worker binding/control-plane metadata. There is no output-path handoff from worker to orchestrator, and `workflow-runner continue` does not accept output paths.

On success, `write-output` stdout is acceptance JSON such as `{ "ok": true, "accepted": true, ... }`. The host must not treat `write-output` stdout as the next workflow directive: it only marks one current request output as accepted. After every current request is accepted, the host continues following the latest `next`/`continue` instruction and runs the embedded `continue --only-instructions` command.

Typical worker output envelope:

```json
{
  "outcome": "ready",
  "artifacts": [],
  "results": [{ "type": "summary", "summary": "completed" }]
}
```

Approval output without a declared schema is any host/user JSON object compatible with the approval transition, commonly:

```json
{
  "approval": "approved"
}
```

When an approval step declares `output.schema`, the host should normalize the user's answer as strict JSON matching that schema before calling `write-output`. The schema normalizes the answer shape for validation/routing.

Missing host capability is represented as blocked output, not as a transition decision in skill text:

```json
{
  "outcome": "blocked",
  "blocker": {
    "reason": "missing host capability",
    "needed": "spawn worker"
  }
}
```

For each requested step, accept output first:

```bash
node ./lib/entrypoints/cli/workflow-runner.mjs write-output --lease-token "$WORKFLOW_RUN_TOKEN" --run-id "$RUN_ID" --step-id "step_id" --workflow "$WORKFLOW" <<'JSON'
{ "outcome": "ready", "artifacts": [], "results": [] }
JSON
```

After every current request has accepted output, continue without `--output`:

```bash
node ./lib/entrypoints/cli/workflow-runner.mjs continue --lease-token "$WORKFLOW_RUN_TOKEN" --run-id "$RUN_ID" --workflow "$WORKFLOW" --only-instructions
```

For parallel branch requests, call `write-output` once per requested `stepId`; `continue` collects the accepted values from baton/state into the existing portable `{ "steps": { ... } }` envelope internally before applying workflow state.

## OpenClaw mapping example

OpenClaw is one possible host adapter:

- `run_worker` maps to spawning a fresh subagent/ACP session or continuing/restoring the opaque `preferredAgentId` when the host can do so.
- Level 1 loop continuity across workflow iterations is prompt-only: draft/critic/revision workers must rely on explicit prompt input and prior accepted step outputs, not persistent worker lifecycle machinery. A concise clarification is an allowed same-session continuation: the subagent asks, pauses, receives the routed user reply in that same clarification session, and continues from existing context without restart or context widening. Worker reuse hints only choose between `loadInstructionsCommand` and `loadFollowupInstructionsCommand`; they do not create lifecycle/session semantics.
- The bootstrap must use this shape and substitute `<command>` with either `loadFollowupInstructionsCommand` for a restored preferred worker or `loadInstructionsCommand` for a fresh worker:

  ```text
  Load the step instructions by running:

  <command>

  Then follow the loaded instructions exactly.

  Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

  If the instructions cannot be loaded, stop with an error and do not continue.
  ```

- After the wrapper knows the actual selected worker id, it runs `bindAgentCommand` after replacing only the literal `<agent-id>` placeholder with the shell-quoted actual id. This binding is advisory, retry-safe, and stored only as top-level `baton.workerBindings[stepId]`.
- The loaded instructions must provide an exact validating writer command/tool. The subagent should use that single command/tool to write its generated JSON. If the command/tool returns validation errors, the subagent fixes the JSON and reruns the same command/tool for a bounded number of attempts. On success, the subagent reports acceptance, not an output path.
- `wait_for_approval` does not spawn a worker. The wrapper/orchestrator follows the inline approval prompt in runner stdout, attaches required-read files and prompt input artifact paths through the approval mechanism, shows the required context/artifacts to the user, asks only for the requested decision/input, and writes the normalized approval JSON with the validating writer command from that prompt.
- If no exact worker-side validating writer protocol is provided, the wrapper treats that as a blocked host capability instead of capturing a fallback output file.
- The wrapper calls `workflow-runner.mjs continue` without `--output` after every current request has been accepted by `write-output`.
- If OpenClaw cannot provide the requested capability, the wrapper writes a blocked JSON output through `write-output` when possible.
- The adapter repeats until the runner returns a terminal status.

This mapping is not part of the portable workflow contract. Other hosts can execute the same requests differently as long as they accept compatible JSON through `write-output` before `continue`. If a host action produces markdown or a report, the wrapper should wrap it in the step's expected JSON output or store it as a referenced artifact; it should not pass arbitrary markdown as runner output unless the step schema/runtime explicitly expects that.

## Not final in this draft

- The runner request schema is not yet split into a standalone JSON schema.
- Host action types beyond the existing workflow actions are intentionally minimal.
- `workflow-runner.mjs continue` uses an internal per-run lock guard so only one host continue operation mutates a single run at a time; lock paths are private runner state.
- The CLI shape is small on purpose and can be renamed after review.

`./lib/entrypoints/cli/start-run.mjs` is legacy initialization/inspection only. It requires the same lease token carrier and never exposes private baton/history paths. It does not accept `--user-prompt` or `--user-prompt-file`; use `workflow-runner next` for startup prompt capture and instruction rendering.
