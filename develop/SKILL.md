---
name: develop-dev-harness
description: Use for coding requests that should run the DevHarness baton workflow through bounded worker prompts, approval waits, and the handoff helper.
---

# Dev Harness

Orchestrate the workflow loop against the persisted baton.

1. Read the persisted baton only. Do not read, load, summarize, or iterate the workflow JSON; it is a script asset, not agent context.
2. Before entering the loop, or after any restart, call the handoff script to restore the executable directive:

   ```bash
   node develop/dev-harness-step.mjs inspect <workflow.json> <baton.json>
   ```

3. Follow only the returned `directive`; do not infer step transitions yourself.
4. If `directive.action == "run_worker"`, run one bounded worker for the baton cursor directive and capture its strict JSON output. Prompt templating remains TODO/out of scope here.
5. If `directive.action == "wait_for_approval"`, stop and wait for explicit human approval before producing approval JSON.
6. After worker output or approval output exists, call the handoff script with that output:

   ```bash
   node develop/dev-harness-step.mjs apply <workflow.json> <baton.json> <worker-or-approval-output.json>
   ```

7. If the script succeeds, persist the returned `baton` by writing it to a temporary file and atomically replacing the old baton, then continue with the returned `directive`.
8. If worker output or the handoff script fails, keep the old baton unchanged and retry the same baton/current cursor.
9. Loop until `directive.action` is `stop_done` or `stop_blocked`, or until the script returns a blocker.

Baton shape:

- `cursor`: current workflow step id and only workflow pointer.
- `status`: `running | done | blocked` when present.
- `blocker` / `error`: optional terminal or diagnostic details when a step blocks or fails.
- `state.artifacts`: durable produced records that later steps can depend on, including approval evidence when needed.
- `state.results`: optional step outputs or summaries useful to operators but not prerequisites.
- `state.history`: handoff/audit events.
- `state.attempts`: optional retry counters keyed by cursor or handoff id.

Do not put `next`, `prev`, `currentStep`, executable directives, prompt text, or top-level approval state in the baton. The handoff helper returns the directive for the current `cursor`; `cursor` remains the workflow pointer.
