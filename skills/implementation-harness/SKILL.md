---
name: implementation-harness
description: Own the post-approval implementation stage for an already approved task. Use when you have approved task context plus an approved research packet and need to execute, delegate, verify, and review against that closed research without reopening broad discovery.
---

# Implementation Harness

Use only after approval. This skill executes against approved research. It does not do GitHub transport, issue triage, approval seeking, or broad readiness review.

## Read order

1. Read [references/input-contract.md](references/input-contract.md).
2. Read [references/workflow.md](references/workflow.md).
3. Read [references/testing.md](references/testing.md) before verification.
4. Read [references/output-contract.md](references/output-contract.md) before returning results.

## What this skill owns

- Takes approved task context plus a research packet as input.
- Decides implementer routing: `backend`, `frontend`, or both.
- Runs implementation, smallest meaningful verification, and review/fix passes.
- Returns a structured packet for another layer to persist or publish.

## What this skill does not own

- No approval gate.
- No broad discovery or proposal rewrite.
- No GitHub transport, PR creation, issue commenting, or branch publishing.
- No repo-external persistence.

## Core rules

- Treat the approved scope as frozen.
- Treat the approved research packet as the implementation contract unless a concrete blocker, contradiction, or missing implementation-critical fact survived research.
- Use only canonical implementer labels: `backend`, `frontend`.
- One owner per file zone. If zones overlap, collapse to one implementer.
- Review is mandatory after every implementation pass.
- Keep review as an independent implementation-stage code review; it must not reopen broad task research.
- If review forces redesign or scope growth, stop as `blocked`.
- Return only the packet shape defined in [references/output-contract.md](references/output-contract.md).
