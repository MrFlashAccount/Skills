# Workflow Runner Host Adapter Boundary

## Status

Draft shape for architecture review.

## Boundary

Deterministic code owns the workflow loop:

- start or resume a run;
- render the current step prompt;
- return host action requests;
- apply host outputs;
- persist baton state and history;
- repeat until another host action is needed or the workflow reaches `done` / `blocked`.

The host adapter is thin. It executes requests with whatever capabilities the environment provides, writes the requested output files, and calls the runner again. It does not choose transitions.

## Runner commands

```bash
node develop/scripts/workflow-runner.mjs next --run-dir <run-dir> [--workflow <workflow.json>]
node develop/scripts/workflow-runner.mjs continue --run-dir <run-dir> [--workflow <workflow.json>]
```

`next` creates the run files if needed and returns the current host work. `continue` reads outputs from the previous host requests, applies them, persists the new baton, and returns the next host work.

## Host request response

When host work is needed, the runner returns:

```json
{
  "status": "needs_host_actions",
  "baton": {},
  "requests": [
    {
      "id": "step_id",
      "action": "run_worker",
      "compiledPrompt": { "prompt": "..." },
      "outputPath": "/run/outputs/step_id.json"
    }
  ]
}
```

Terminal statuses are:

- `done`
- `blocked`

A CLI failure is an execution error and should be reported by the host adapter instead of forcing a workflow transition.

## Output envelopes

The host adapter writes each request result to exactly the returned `outputPath`.

Typical worker output:

```json
{
  "outcome": "ready",
  "artifacts": [],
  "results": [{ "type": "summary", "summary": "completed" }]
}
```

Approval output:

```json
{
  "approval": "approved"
}
```

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

For parallel branch requests, the runner returns one request per branch with one output path per branch. `continue` collects those files into the existing portable `{ "steps": { ... } }` envelope internally before applying workflow state.

## OpenClaw mapping example

OpenClaw is one possible host adapter:

- `run_worker` maps to spawning a subagent or ACP session with `compiledPrompt.prompt`.
- The subagent result is written to the request `outputPath` as JSON.
- If OpenClaw cannot provide the requested capability, it writes a blocked output.
- The adapter calls `workflow-runner.mjs continue` and repeats.

This mapping is not part of the portable workflow contract. Other hosts can execute the same requests differently as long as they write the requested output envelopes.

## Not final in this draft

- The runner request schema is not yet split into a standalone JSON schema.
- Host action types beyond the existing workflow actions are intentionally minimal.
- Locking/concurrent host execution safeguards are not implemented here.
- The CLI shape is small on purpose and can be renamed after review.
