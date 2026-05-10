# Execution Plan Contract

Use this after research is closed and before starting any development task that needs an explicit execution plan. For tiny work, this may be a compact one-paragraph or short-bullet version of the same contract.

## Contract

- Goal:
- Non-goals:
- File zones:
- Implementer owners:
- Reviewer:
- Acceptance criteria:
- Design-test: required/not-required/unknown + why
- Rollback point:
- Risks:
- Sensitive surface: yes/no + why
- Sensitive inputs:
- Persistence:
- Exposure surface:
- Request-path impact:
- Contract touchpoints:
- Docs to update:
- Reviewer plan:
- Architecture notes: seam decisions, file-zone rationale, request-path boundaries, dependency decisions
- Design-test scope: intended UI shape, required components, critical states/behavior, detail expectations

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
- If UI, interaction behavior, or component composition is materially part of the slice, the contract must explicitly say whether a `design-test` is required before implementation.
- When required, `design-test` should be concrete enough to guide later implementation/review: intended UI shape, required components, critical states/behavior, and notable detail expectations.
- If `Sensitive surface` is yes or uncertain, fill all sensitive-data fields before approval.
- If the slice stores or reuses user-provided data, the contract must say whether storage is one-shot or persistent, and whether explicit user consent is required.
- If the slice touches backend request-path, persistence, or async runtime behavior, the contract must say whether any blocking sync I/O exists on the request path, which contract/request-shape surfaces can drift, and which docs/architecture notes must stay in sync.
- If an architect pass ran, its file-zone and seam conclusions must be captured in `Architecture notes` rather than left implicit in chat.

## Output

- Short plan
- Owner-to-zone map
- Explicit handoff notes
- Durable follow-up items
- Design-test requirement/status when UI is materially in scope

## Tiny-task compact form

For tiny, obvious, low-risk work, the execution plan may be compressed to a short form that still names:
- goal
- file zone
- owner
- acceptance check
- rollback point or revert strategy

Tiny work does not skip the stage; it uses a compact version of it.
