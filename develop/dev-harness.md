# Dev Harness

Orchestrate the workflow loop against the persisted baton.

1. Load `develop/dev-harness.workflow.json` and the current baton.
2. Read `nextStep.action` from the baton.
3. If `nextStep.action == "generate_worker_prompt"`, generate one bounded worker prompt from the current next step, run the worker, and capture its strict JSON output.
4. If `nextStep.action == "wait_for_approval"`, stop and wait for explicit human approval before producing approval JSON.
5. After worker output or approval output exists, call the transition helper:

   ```bash
   node develop/dev-harness-step.mjs <workflow.json> <baton.json> <worker-or-approval-output.json>
   ```

6. If the helper succeeds, persist the returned `baton` by writing it to a temporary file and atomically replacing the old baton, then continue from the returned `nextStep`.
7. If the helper fails, keep the old baton unchanged and stop as a blocker.
8. Stop when the baton status is `done` or `blocked`, or when `nextStep.action == "stop"`.

Schema validation is owned by the helper.
