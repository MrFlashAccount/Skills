---
name: implementation-harness
description: Own the post-approval implementation stage for an already approved task. In the repo's four-stage flow, this is the `development` stage. Use when you have approved task context plus approved research and execution-plan context and need to execute and verify against that closed contract without reopening broad discovery.
---

# Implementation Harness

Use only after approval. This skill executes against approved research and approved execution planning. It does not do GitHub transport, issue triage, approval seeking, or broad readiness review.

## Read order

1. Read [references/input-contract.md](references/input-contract.md).
2. Read [references/workflow.md](references/workflow.md).
3. Read [references/testing.md](references/testing.md) before verification.
4. Read [references/output-contract.md](references/output-contract.md) before returning results.

## What this skill owns

- Takes approved task context plus approved research and execution-plan context as input.
- Decides implementer routing: `backend`, `frontend`, or both.
- Runs implementation and the smallest meaningful verification handoff.
- Returns a structured packet for another layer to persist or publish.

## What this skill does not own

- No approval gate.
- No broad discovery or proposal rewrite.
- No independent post-implementation review verdict; it only hands back enough evidence for the next review stage.
- No GitHub transport, PR creation, issue commenting, or branch publishing.
- No repo-external persistence.

## Core rules

- Treat the approved scope as frozen.
- Treat the approved research packet plus approved execution plan as the implementation contract unless a concrete blocker, contradiction, or missing implementation-critical fact survived earlier stages.
- Use only canonical implementer labels: `backend`, `frontend`.
- One owner per file zone. If zones overlap, collapse to one implementer.
- Verification is mandatory before handing the slice to post-implementation review.
- If verification fails, fix in scope and re-validate before handing off.
- If development forces redesign or scope growth, stop as `blocked`.
- Return only the packet shape defined in [references/output-contract.md](references/output-contract.md).
- Treat implementer completion notes as non-authoritative until validation passes and the downstream review gate clears the slice.
- Do not embed an independent review verdict inside this stage; the separate review stage owns that decision.
