---
name: implementation-harness
description: Own the post-approval implementation stage for an already approved task. In the repo's four-stage flow, this is the `development` stage. Use when you have approved task context plus approved research and execution-plan context and need to execute and verify against that closed contract without reopening broad discovery.
---

# Implementation Harness

Use only after approval. This skill executes against approved research and approved execution planning. It does not do GitHub transport, issue triage, approval seeking, or broad readiness review.

## Read order

1. Read [references/input-contract.md](references/input-contract.md).
2. Read [references/workflow.md](references/workflow.md).
3. Before spawning implementer workers, read [../dev-harness/references/roles/implementers.md](../dev-harness/references/roles/implementers.md) and use the selected implementer section as the role-load contract.
4. Read [references/testing.md](references/testing.md) before verification.
5. Read [references/output-contract.md](references/output-contract.md) before returning results.

## What this skill owns

- Takes approved task context plus approved research and execution-plan context as input.
- Decides implementer routing: `backend`, `frontend`, or both.
- Runs implementation through delegated implementer worker/subagent sessions, then performs the smallest meaningful verification handoff.
- Returns a structured packet for another layer to persist or publish.

## What this skill does not own

- No approval gate.
- No broad discovery or proposal rewrite.
- No independent post-implementation review verdict; it only hands back enough evidence for the next review stage.
- No GitHub transport, PR creation, issue commenting, or branch publishing.
- No repo-external persistence.

## Core rules

- Treat the approved scope as frozen.
- Do not execute implementation in the parent orchestrator session just because it would be faster; this stage should run through delegated implementer workers/subagents.
- Plain user action verbs like `fix`, `do`, `сделай`, or `исправь` do not count as permission for direct parent-session implementation; only an explicit request for direct in-session execution overrides the orchestrator default.
- If required implementer delegation is unavailable, fails to start, or cannot be used, stop as `blocked`; do not fall back to manual implementation in the parent/orchestrator session.
- Treat the approved research packet plus approved execution plan as the implementation contract unless a concrete blocker, contradiction, or missing implementation-critical fact survived earlier stages.
- Use only canonical implementer labels: `backend`, `frontend`.
- A role label alone is not a role contract. Each implementer prompt must include the role invocation material from [../../shared/templates/role-invocation-template.md](../../shared/templates/role-invocation-template.md), filled with the shared delegated role task template from [../../shared/delegate/delegated-role-task-template.md](../../shared/delegate/delegated-role-task-template.md), the selected role material path, compact implementer focus from [../dev-harness/references/roles/implementers.md](../dev-harness/references/roles/implementers.md), and the concrete approved task packet/scope/verification expectations.
- Do not accept implementer output for a required file zone if required role material cannot be loaded or loaded role material's additional, final-answer, or output requirements cannot be satisfied; mark the stage `blocked` instead.
- One owner per file zone. If zones overlap, collapse to one implementer.
- Verification is mandatory before handing the slice to post-implementation review.
- If verification fails, fix in scope and re-validate before handing off.
- If development forces redesign or scope growth, stop as `blocked`.
- Return only the packet shape defined in [references/output-contract.md](references/output-contract.md).
- Treat implementer completion notes as non-authoritative until validation passes and the downstream review gate clears the slice.
- Do not embed an independent review verdict inside this stage; the separate review stage owns that decision.
