# DevHarness prototype

Minimal deterministic transition helper for a staged DevHarness workflow.

Files:

- `dev-harness.workflow.yaml` — workflow steps and allowed outcomes
- `dev-harness.baton.schema.yaml` — minimum baton shape
- `dev-harness-step.mjs` — executable transition helper
- `fixtures/` — tiny runnable example inputs

Run:

```bash
node develop/dev-harness-step.mjs \
  develop/dev-harness.workflow.yaml \
  develop/fixtures/baton.yaml \
  develop/fixtures/worker-output.yaml
```

The script reads workflow, baton, and worker/approval output as JSON or a small YAML subset. On success it prints `{ baton, nextStep }` JSON to stdout. On invalid baton shape, missing step, unknown outcome, or invalid transition, it prints an error to stderr and exits non-zero without writing files.

Scope is intentionally small: no runner engine, no agent spawning, no external integrations.
