# Task Contract

Use this before starting any non-trivial dev task.

## Contract

- Goal:
- Non-goals:
- File zones:
- Implementer owners:
- Reviewer:
- Acceptance criteria:
- Rollback point:
- Risks:

## Rules

- One agent per file zone.
- Each implementer owner must use only `backend` or `frontend` as the role label.
- Each owner must map to one closed, exclusive file zone. No file may belong to two owners.
- `Feature slice` is not a free-form label; use it only if it resolves to one closed file set with one owner.
- If the work cannot be partitioned cleanly, collapse ownership to one implementer instead of inventing pseudo-slices.
- One PR per semantic chunk.
- No overlap between implementer and critic.
- Reviewer labels are separate from implementer labels and may not be reused as implementer ownership labels.
- Freeze scope once the contract is agreed.

## Output

- Short plan
- Owner-to-zone map
- Explicit handoff notes
- Durable follow-up items
