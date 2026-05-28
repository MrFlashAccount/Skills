---
name: develop-workflow-runtime
description: Use for requests that should run a baton workflow through deterministic runner requests and host actions.
---

# Workflow Runtime Host Adapter

This skill is a thin host adapter. The code-level runner owns the workflow loop: start or resume the run, render the current step, apply host outputs provided by the wrapper, persist baton state, and repeat until a host action is needed or the workflow reaches `done` / `blocked`.

The skill does not choose transitions and does not interpret workflow structure.

## Variables

- `RUN_DIR`: directory for one run, for example `/tmp/develop-run`.
- `WORKFLOW`: optional workflow JSON path. If omitted, the runner uses `develop/dev-harness.workflow.json`.
- `ARTIFACT_PATH`: wrapper-owned file path for one captured host action result.

## Main loop

1. Ask the runner for the next host work:

   ```bash
   node develop/scripts/workflow-runner.mjs next --run-dir "$RUN_DIR" --workflow "$WORKFLOW"
   ```

   For an existing run, continue only after wrapper-owned output artifacts are ready:

   ```bash
   node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --workflow "$WORKFLOW" --output "$ARTIFACT_PATH"
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
     "loadInstructionsCommand": "node develop/scripts/workflow-runner.mjs instructions --run-dir '/path/to/run' --step-id 'step_id'"
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

4. Capture the host action result into a wrapper-owned artifact file.

   Output path/name is wrapper-owned transport, not runner/interpreter contract. The filename may derive from `stepId`; the runner does not dictate the public `outputPath`.

   The artifact content passed back to the runner must still be workflow-compatible output JSON/envelope that the runner/interpreter can read. Worker or approval output should follow the normal envelope:

   ```json
   {
     "outcome": "ready",
     "results": [{ "type": "summary", "summary": "..." }]
   }
   ```

   If the host lacks a required capability, capture a blocked result instead of inventing a transition:

   ```json
   {
     "outcome": "blocked",
     "blocker": {
       "reason": "missing host capability",
       "needed": "..."
     }
   }
   ```

5. Call continue with the wrapper-owned artifacts.

   Single request:

   ```bash
   node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --workflow "$WORKFLOW" --output "$ARTIFACT_PATH"
   ```

   Parallel requests:

   ```bash
   node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --workflow "$WORKFLOW" \
     --output "branch_a=/host/artifacts/branch_a.structured.json" \
     --output "branch_b=/host/artifacts/branch_b.output.json"
   ```

6. Repeat until the runner returns `done` or `blocked`.

## Rules

- Do not choose branch, join, loop, retry, done, or blocked transitions in skill text.
- Do not edit baton state by hand.
- Do not add host-specific fields to workflow JSON or worker outputs.
- Execute only host action requests returned by the runner.
- Use `loadInstructionsCommand` to load step instructions; host requests must not carry compiled prompt text.
- Output capture is wrapper-owned transport. Do not treat output paths as runner/interpreter request fields.
- Output artifact content passed to `continue` must be workflow-compatible output JSON/envelope. If a step produces markdown/report content, wrap it in the expected JSON result or store it as a referenced artifact according to that step's expected output; do not pass arbitrary markdown as runner output unless that step schema/runtime explicitly expects it.
- Missing host capability becomes a blocked output artifact.
