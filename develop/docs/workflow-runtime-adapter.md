# Workflow Runner Host Adapter Boundary

## Status

Draft shape for architecture review.

## Boundary

Deterministic code owns the workflow loop:

- start or resume a run;
- render the current step prompt;
- return host action requests;
- apply host outputs provided by the host wrapper;
- persist baton state and history;
- repeat until another host action is needed or the workflow reaches `done` / `blocked`.

The host adapter is thin. It executes requests with whatever capabilities the environment provides, captures each host action result into artifact files it owns, and calls the runner again with those artifacts. It does not choose transitions.

## Runner commands

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> [--workflow <workflow.json>] [--user-prompt <text> | --user-prompt-file <path>]
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> --output <worker-output.json> [--output <step-id=worker-output.json> ...] [--workflow <workflow.json>]
node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id <run-id> --step-id <id>
```

`next` creates the run files if needed and returns the current host work. `continue` applies host-provided artifact paths from the previous host requests, persists the new baton, and returns the next host work. `instructions` prints only the compiled instructions for one current requested step and fails for unknown, unsafe, or missing step instructions.

### Startup user prompt

When starting a new run, `next` may receive the raw startup user prompt with `--user-prompt` or `--user-prompt-file`. The runner stores it once as top-level `baton.user_prompt`. Existing runs are resumed as-is: later `next` calls do not overwrite `baton.user_prompt`, and `continue` preserves it while advancing the baton.

At run initialization, the runner deterministically selects and persists `baton.user_prompt_target` from the static startup topology. A target is stable only when all possible startup paths that can be chosen before the first worker guarantee the same worker target; static fanout may pin one rendered worker branch, but ambiguous dynamic transitions, divergent `match/cases`, and terminal/no-worker `match/cases` branches fail loudly instead of accepting a prompt that might be unused.

The runner/interpreter injects the startup prompt only into the render context for the persisted `baton.user_prompt_target` until that selected worker's output is applied. Rendering validates that the saved target is still defined, is still a worker, and is present whenever the current response renders workers or reaches a terminal step; otherwise the runner fails rather than silently dropping `baton.user_prompt`. It persists `baton.user_prompt_injected: true` only when applying that selected worker output, so a crash or repeated `next` before completion keeps the prompt in that same worker's instructions, while resume or workflow-shape drift after completion cannot reinject it into a later worker. The template compiler only renders a `## User prompt` section for worker steps when that render-time value is passed; it does not decide eligibility itself. `workflow.start` may be a control step; approval/user-gate answers are separate host interactions, not startup `user_prompt`, and later workers do not receive this section unless the workflow explicitly carries derived context through normal state/output paths.

## Host request response

When host work is needed, the runner returns:

```json
{
  "status": "needs_host_actions",
  "baton": {},
  "requests": [
    {
      "id": "step_id",
      "stepId": "step_id",
      "action": "run_worker",
      "loadInstructionsCommand": "node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id 'run_id' --step-id 'step_id'"
    }
  ]
}
```

The public host request contract is intentionally narrow: requested action identity, step identity, and the instruction-loader command are always public. Approval requests may additionally include output-schema metadata when the workflow step declares `output.schema`. `outputSchema` is the legacy raw workflow reference. `resolvedOutputSchema` is the preferred host-adapter contract when present: it contains `{ ref, schema }`, where `ref` is the same raw workflow reference and `schema` is the JSON payload describing the normalized answer expected back from the host. Neither field exposes runner filesystem paths. Instruction storage paths are private runner state. Output path and filename are wrapper-owned transport details, not runner/interpreter request contract.

Terminal statuses are:

- `done`
- `blocked`

A CLI failure is an execution error and should be reported by the host adapter instead of forcing a workflow transition.

## Output capture

The host wrapper captures each request result into an artifact file it owns. The filename may derive from `stepId`; the runner does not dictate public artifact names, paths, or `outputPath`.

The artifact content passed back to the runner must still be workflow-compatible output JSON/envelope that the runner/interpreter can read. Typical worker output envelope:

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

When an approval step declares `output.schema`, the host should capture the user's answer as strict JSON matching that schema. The schema normalizes the answer shape for validation/routing.

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

For one requested step, pass the wrapper-owned artifact back on continue:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id "$RUN_ID" --output "/host/artifacts/step_id.json" --workflow "$WORKFLOW"
```

For parallel branch requests, pass one named output per requested step. `continue` collects those files into the existing portable `{ "steps": { ... } }` envelope internally before applying workflow state.

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id "$RUN_ID" \
  --output "branch_a=/host/artifacts/branch_a.structured.json" \
  --output "branch_b=/host/artifacts/branch_b.output.json" \
  --workflow "$WORKFLOW"
```

## OpenClaw mapping example

OpenClaw is one possible host adapter:

- `run_worker` maps to spawning a fresh/disposable subagent or ACP session with a neutral bootstrap that runs `loadInstructionsCommand`.
- The bootstrap must use this shape and substitute `<command>` with the request's `loadInstructionsCommand`:

  ```text
  Load the step instructions by running:

  <command>

  Then follow the loaded instructions exactly.

  Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

  If the instructions cannot be loaded, stop with an error and do not continue.
  ```

- The wrapper captures the subagent final answer/result into an artifact file it owns.
- The wrapper calls `workflow-runner.mjs continue` with the artifact path or paths; those paths are wrapper-owned transport, but the file content must be runner-compatible output JSON/envelope.
- If OpenClaw cannot provide the requested capability, the wrapper captures a blocked output artifact.
- The adapter repeats until the runner returns a terminal status.

This mapping is not part of the portable workflow contract. Other hosts can execute the same requests differently as long as they pass compatible output artifacts back to `continue`. If a host action produces markdown or a report, the wrapper should wrap it in the step's expected JSON output or store it as a referenced artifact; it should not pass arbitrary markdown as runner output unless the step schema/runtime explicitly expects that.

## Not final in this draft

- The runner request schema is not yet split into a standalone JSON schema.
- Host action types beyond the existing workflow actions are intentionally minimal.
- `workflow-runner.mjs continue` uses a per-run `.workflow-runner/continue.lock` guard so only one host continue operation mutates a single internal derived run-state tree at a time.
- The CLI shape is small on purpose and can be renamed after review.

`develop/lib/entrypoints/cli/start-run.mjs` is legacy initialization/inspection only. It does not accept `--user-prompt` or `--user-prompt-file`; use `workflow-runner next` for startup prompt capture and instruction rendering.
