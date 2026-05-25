---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the develop/dev-harness handoff helper.
---

# Dev Harness

Orchestrate the workflow loop against the persisted baton.

1. Load `develop/dev-harness.workflow.json` and the persisted baton.
2. Before entering the loop, or after any restart, restore the executable directive from the script:

   ```bash
   node develop/dev-harness-step.mjs inspect <workflow.json> <baton.json>
   ```

3. Follow only the returned `directive`; do not inspect the workflow graph or infer step transitions in the orchestrator.
4. If `directive.action == "run_worker"`, run one bounded worker for the baton cursor directive and capture its strict JSON output. Prompt templating remains TODO/out of scope here.
5. If `directive.action == "wait_for_approval"`, stop and wait for explicit human approval before producing approval JSON.
6. After worker output or approval output exists, apply it through the script:

   ```bash
   node develop/dev-harness-step.mjs apply <workflow.json> <baton.json> <worker-or-approval-output.json>
   ```

7. If the script succeeds, persist the returned `baton` by writing it to a temporary file and atomically replacing the old baton, then continue with the returned `directive`.
8. If the script fails, keep the old baton unchanged; the persisted baton remains authoritative.
9. Loop until `directive.action` is `stop_done` or `stop_blocked`, or until the script returns a blocker.

The baton contains accumulated machine state and the workflow cursor (`cursor`) only. It must not store executable directive state; the script is the only source of directive truth.

Compact retry/rollback policy:

- Worker side effects must be bounded, idempotent, or rollback-capable.
- If a worker fails before side effects, retry the baton cursor directive or stop as blocked.
- If a worker may have produced side effects and output is rejected, keep the old baton, then run a bounded rollback/cleanup worker or retry the same baton cursor directive only when safe.
- Retry/rollback output must still go through `apply`; no retry or rollback mutates baton outside the script.

Schema validation is owned by the helper.
