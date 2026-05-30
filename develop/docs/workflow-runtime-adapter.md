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
node develop/scripts/workflow-runner.mjs next --run-dir <run-dir> [--workflow <workflow.json>]
node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> --output <worker-output.json> [--output <step-id=worker-output.json> ...] [--workflow <workflow.json>]
node develop/scripts/workflow-runner.mjs instructions --run-dir <run-dir> --step-id <id>
```

`next` creates the run files if needed and returns the current host work. `continue` applies host-provided artifact paths from the previous host requests, persists the new baton, and returns the next host work. `instructions` prints only the compiled instructions for one current requested step and fails for unknown, unsafe, or missing step instructions.

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
      "loadInstructionsCommand": "node develop/scripts/workflow-runner.mjs instructions --run-dir '/run' --step-id 'step_id'"
    }
  ]
}
```

The public host request carries only the requested action identity, step identity, and instruction-loader command. Approval requests may also expose an optional `outputSchema` reference when the workflow step declares `output.schema`; for compatibility this remains the raw workflow reference. New host adapters should prefer the paired `resolvedOutputSchema` object when present: it includes the raw `ref` and schema payload that describes the normalized answer JSON expected back from the host. It intentionally does not expose runner filesystem paths. Instruction storage paths are private runner state. Output path and filename are wrapper-owned transport details, not runner/interpreter request contract.

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
node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --output "/host/artifacts/step_id.json" --workflow "$WORKFLOW"
```

For parallel branch requests, pass one named output per requested step. `continue` collects those files into the existing portable `{ "steps": { ... } }` envelope internally before applying workflow state.

```bash
node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" \
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
- Locking/concurrent host execution safeguards are not implemented here.
- The CLI shape is small on purpose and can be renamed after review.
