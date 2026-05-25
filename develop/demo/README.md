# Simple file workflow demo

Tiny non-interactive DevHarness replay proof. It exercises the transition-script model with real filesystem side effects in an OS temp workspace, then lets `develop/dev-harness-step.mjs` validate every transition.

Run from repo root:

```bash
node develop/dev-harness-replay.mjs
```

Negative scenario:

```bash
node develop/dev-harness-replay.mjs --negative missing-produced-artifact
```

Fixtures:

- `simple-file-workflow.yaml` — five-step demo workflow
- `initial-baton.yaml` — starting baton
- `step-actions.json` — deterministic scripted side effects and expected outcomes
- `simple-file-workflow-report.md` — reproducible command/report

Runtime artifacts are created under the process OS temp directory as `dev-harness-demo-*` and are safe to delete.
