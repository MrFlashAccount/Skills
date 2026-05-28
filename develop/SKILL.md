---
name: develop-workflow-runtime
description: Use for requests that should run a baton workflow through deterministic runner requests and host actions.
---

# Workflow Runtime Host Adapter

This skill is a thin host adapter. The runner owns workflow logic: state, step rendering, transitions, baton persistence, and terminal `done` / `blocked` decisions.

The skill executes host requests, captures wrapper-owned artifacts, and returns runner-compatible output JSON/envelopes.

## Inputs

- `RUN_DIR`: directory for one run, for example `/tmp/develop-run`.
- `WORKFLOW`: optional workflow JSON path; omit it to use the runner default.

## Commands

```bash
node develop/scripts/workflow-runner.mjs next --run-dir "$RUN_DIR" --workflow "$WORKFLOW"
node develop/scripts/workflow-runner.mjs continue --run-dir "$RUN_DIR" --workflow "$WORKFLOW" --output /host/artifact.json
```

For a `run_worker` request, use `loadInstructionsCommand` as the instruction-loading command.

## Main loop

1. Run `next`, or run `continue` after artifact files are ready.
2. If the runner returns `needs_host_actions`, execute each request exactly as provided.
3. For each request, capture the host result in a wrapper-owned artifact file.
4. Run `continue` with the artifact path; repeat until `done` or `blocked`.
5. Stop on `done`, `blocked`, runner errors, or non-zero CLI exits.

Host requests expose only `id`, `stepId`, `action`, and `loadInstructionsCommand`. Artifact paths and filenames are wrapper transport details, not public runner contract.

Use only this neutral bootstrap for loaded worker instructions:

```text
Load the step instructions by running:

<command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```

## Hard rules

- Do not choose branch, join, loop, retry, `done`, or `blocked` transitions.
- Do not edit baton state by hand.
- Do not interpret workflow structure or infer outputs.
- Do not place compiled prompt text in host request context.
- Do not rely on public `outputPath`, `instructionRef`, or `compiledPrompt` fields.
- Artifact content passed back to the runner must be workflow-compatible JSON/envelope.
- Missing host capability becomes a blocked artifact, not a manual transition.

For deeper boundary rationale and examples, see `develop/docs/workflow-runtime-adapter.md`.
