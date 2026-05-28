---
name: develop-workflow-runtime
description: Use for requests that should run a baton workflow through deterministic runner requests and host actions.
---

# Workflow Runtime Host Adapter

This skill is a thin host adapter. The code-level runner owns the workflow loop: start or resume the run, render the current step, apply host outputs, persist baton state, and repeat until a host action is needed or the workflow reaches `done` / `blocked`.

The skill does not choose transitions and does not interpret workflow structure.

## Variables

- `RUN_DIR`: directory for one run, for example `/tmp/develop-run`.
- `WORKFLOW`: optional workflow JSON path. If omitted, the runner uses `develop/dev-harness.workflow.json`.

## Main loop

1. Ask the runner for the next host work:

   ```bash
   node develop/scripts/workflow-runner.mjs next --run-dir "$RUN_DIR" --workflow "$WORKFLOW"
   ```

   For an existing run, use the same command or:

   ```bash
   node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --workflow "$WORKFLOW"
   ```

2. Read the JSON response.

   - `status: "needs_host_actions"`: execute every item in `requests[]` using available host capabilities.
   - `status: "done"`: stop; report completion.
   - `status: "blocked"`: stop; report the blocker from the baton.
   - `status: "error"` or non-zero CLI exit: stop; report the error.

3. For each request, do only the requested host action.

   Request shape:

   ```json
   {
     "id": "step_id",
     "stepId": "step_id",
     "action": "run_worker",
     "instructionRef": "instructions/step_id",
     "loadInstructionsCommand": "node develop/scripts/workflow-runner.mjs instructions --run-dir '/path/to/run' --step-id 'step_id'",
     "outputPath": "/path/to/run/outputs/step_id.json"
   }
   ```

   Do not spawn a long-lived worker with compiled prompt text from the request. Load the step instructions in a fresh/disposable worker with this neutral bootstrap:

   ```text
   Load the step instructions by running:

   <command>

   Then follow the loaded instructions exactly.

   Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

   If the instructions cannot be loaded, stop with an error and do not continue.
   ```

4. Write the host action result to exactly `outputPath` as JSON.

   Worker or approval output should follow the normal envelope:

   ```json
   {
     "outcome": "ready",
     "results": [{ "type": "summary", "summary": "..." }]
   }
   ```

   If the host lacks a required capability, write a blocked result instead of inventing a transition:

   ```json
   {
     "outcome": "blocked",
     "blocker": {
       "reason": "missing host capability",
       "needed": "..."
     }
   }
   ```

5. Call continue after outputs are written:

   ```bash
   node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --workflow "$WORKFLOW"
   ```

6. Repeat until the runner returns `done` or `blocked`.

## Rules

- Do not choose branch, join, loop, retry, done, or blocked transitions in skill text.
- Do not edit baton state by hand.
- Do not add host-specific fields to workflow JSON or worker outputs.
- Execute only host action requests returned by the runner.
- Use `loadInstructionsCommand` to load step instructions; host requests must not carry compiled prompt text.
- Missing host capability becomes a blocked output at the requested path.
