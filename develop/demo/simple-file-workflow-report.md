# Simple file workflow replay report

Purpose: prove the DevHarness transition-script model with a real, deterministic, non-interactive workflow before attempting full DevHarness/user-approval flows.

## Commands

Happy path:

```bash
node develop/dev-harness-replay.mjs
```

Negative path:

```bash
node develop/dev-harness-replay.mjs --negative missing-produced-artifact
```

The replay harness reads:

- `develop/demo/simple-file-workflow.yaml`
- `develop/demo/initial-baton.yaml`
- `develop/demo/step-actions.json`

It writes runtime files under `<os-tmp>/dev-harness-demo-*` only.

## Happy-path sample trace

The happy path completes five deterministic steps and exits with status `done`:

| Step | Side effect | Transition | Added artifact |
| --- | --- | --- | --- |
| `prepare_workspace` | creates workspace folders and `workspace-manifest.json` | `workspace_ready` -> `write_seed_file` | `artifacts.workspaceManifest` |
| `write_seed_file` | writes `files/seed.txt` | `seed_written` -> `append_summary` | `artifacts.seedFile` |
| `append_summary` | reads seed and writes `files/summary.md` | `summary_appended` -> `verify_files` | `artifacts.summaryFile` |
| `verify_files` | verifies seed/summary content and writes `verification.json` | `verified` -> `finalize` | `artifacts.verification` |
| `finalize` | writes `final-report.md` | `done` -> `done` | `artifacts.finalReport` |

Final artifact map:

```json
{
  "workspaceManifest": "workspace-manifest.json",
  "seedFile": "files/seed.txt",
  "summaryFile": "files/summary.md",
  "verification": "verification.json",
  "finalReport": "final-report.md"
}
```

## Negative-path sample

`--negative missing-produced-artifact` performs the `write_seed_file` filesystem side effect but removes `artifacts.seedFile` from that step output before transition validation. `develop/dev-harness-step.mjs` rejects the transition and the replay exits non-zero with:

```text
dev-harness-step: worker output missing required produced field: artifacts.seedFile
```

## Limitations

- Demo-only runner; not a production orchestrator.
- No LLM/subagent execution and no human approval gates.
- YAML parsing remains the same small subset used by the transition helper.
