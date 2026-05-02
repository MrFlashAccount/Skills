---
name: implementation-harness
description: Own the post-approval implementation stage for an already approved task. Use when you have approved task context plus a research packet and need to route backend/frontend implementation, run review, and return a structured result packet for some other transport layer to persist.
---

# Implementation Harness

Use only after approval. This skill does not do GitHub transport, issue triage, or approval seeking.

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
- No GitHub transport, PR creation, issue commenting, or branch publishing.
- No repo-external persistence.

## Core rules

- Treat the approved scope as frozen.
- Use only canonical implementer labels: `backend`, `frontend`.
- One owner per file zone. If zones overlap, collapse to one implementer.
- Review is mandatory after every implementation pass.
- If review forces redesign or scope growth, stop as `blocked`.
- Return only the packet shape defined in [references/output-contract.md](references/output-contract.md).
