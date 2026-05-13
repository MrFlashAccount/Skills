# Execution Plan Contract

Use this after research has produced an approved-for-handoff research packet and, when needed, after Architect has produced the structural contract. For tiny work, this may be a compact one-paragraph or short-bullet version of the same contract.

Execution planning must be concrete enough for implementation shape, ownership, verification, and rollback. It must not become code, pseudocode, algorithms, edit recipes, or a patch plan.

## Contract

- Goal:
- Non-goals:
- Research basis:
- Structural contract: none / reference to Architect output
- Architecture-artifact decision: `none` / `update_existing` / `create_new` + target artifact when applicable
- File zones:
- Implementer owners:
- Implementation entities:
- Reviewer roles:
- Reviewer plan:
- Acceptance criteria:
- Design-test: required/not-required/unknown (draft-only before approval) + why
- Design-test scope: intended UI shape, required components, critical states/behavior, detail expectations
- Verification surfaces:
- Rollback surfaces:
- Explicit handoff notes:
- Durable follow-up items:
- Risks:
- Sensitive surface: yes/no + why
- Sensitive inputs:
- Persistence:
- Exposure surface:
- Request-path impact:
- Contract touchpoints:
- Docs to update:
- Architecture notes: structural contract reference, seam decisions, file-zone rationale, request-path boundaries, dependency decisions

## Implementation entities

Implementation entities are planner-level handoff objects. They describe what implementation must account for without prescribing exact code.

Allowed kinds include:

- `module`
- `class`
- `function`
- `component`
- `config_key`
- `schema`
- `adapter`
- `route`
- `command`
- `doc_artifact`
- `contract_surface`
- `migration`

Each entity should include:

- `kind`
- `name`
- `responsibility`
- `inputs`
- `outputs`
- `integration_point`
- `file_zone`
- `verification_surface`
- `rollback_surface`
- `source_or_evidence`

Per-entity `rollback_surface` entries roll up into top-level `Rollback surfaces`, which summarizes the concrete revert or containment surfaces across the whole slice.

Terminology:

- Researcher owns `domain_vocabulary` and known facts/evidence.
- Architect owns `structural_entities`, relationships, dependency rules, and final structural contract.
- Execution planning owns `implementation_entities` and worker handoff.

## Planner dual-pass

For non-trivial work:

1. `Planner A propose`: creates the execution contract from the approved-for-handoff research packet and structural contract when present.
2. `Planner B attack`: challenges implementation entity coverage, file-zone ownership, verification surfaces, rollback surfaces, sensitive surfaces, request-path/contract touchpoints, risks, and max-detail leaks.
3. Allow one bounded revise/re-review loop when the attack finds fixable gaps, unless the caller explicitly approves another.

This is the same planner role/class in an attack pass, not a separate role.

## Rules

- Execution planning may start only from an approved-for-handoff research packet: `approve_as_is`, or `approve_with_changes` only after required changes are folded back in.
- One agent per file zone.
- Each implementer owner must use only `backend` or `frontend` as the role label.
- Each owner must map to one closed, exclusive file zone. No file may belong to two owners.
- `Feature slice` is not a free-form label; use it only if it resolves to one closed file set with one owner.
- If the work cannot be partitioned cleanly, collapse ownership to one implementer instead of inventing pseudo-slices.
- One PR per semantic chunk.
- No overlap between implementer and reviewer/critic roles.
- Reviewer role labels are separate from implementer labels and may not be reused as implementer ownership labels.
- Freeze scope once the contract is agreed.
- If UI, interaction behavior, or component composition is materially part of the slice, the contract must explicitly say whether a `design-test` is required before implementation.
- For approved UI-relevant plans, `Design-test` may not stay `unknown`; resolve it to `required` or `not-required` before implementation handoff.
- When required, `design-test` should be concrete enough to guide later implementation/review: intended UI shape, required components, critical states/behavior, and notable detail expectations.
- If `Sensitive surface` is yes or uncertain, fill all sensitive-data fields before approval.
- If the slice stores or reuses user-provided data, the contract must say whether storage is one-shot or persistent, and whether explicit user consent is required.
- If the slice touches backend request-path, persistence, or async runtime behavior, the contract must say whether blocking sync I/O exists on the request path, which contract/request-shape surfaces can drift, and which docs/architecture notes must stay in sync.
- If an Architect pass ran, its structural contract, file-zone and seam conclusions, dependency rules, and artifact decision must be captured in `Architecture notes` rather than left implicit in chat.

## Max-detail guardrails

Before approval, the execution plan must not include:

- exact signatures
- pseudocode
- algorithms
- code blocks
- class/function skeletons
- exact file-by-file edit recipes
- patch-like diffs
- migration bodies
- implementation command sequences
- generated source/config snippets

A valid plan says what implementation must preserve and integrate with; it does not tell the implementer exactly how to write the patch.

## Output

- Short plan
- Owner-to-zone map
- Implementation entities
- Reviewer roles and reviewer plan
- Explicit handoff notes
- Verification surfaces
- Rollback surfaces
- Durable follow-up items
- Design-test decision when UI is materially in scope
- Architecture artifact decision and structural contract reference when applicable

## Tiny-task compact form

For tiny, obvious, low-risk work, the execution plan may be compressed to a short form that still names:

- goal
- file zone
- owner
- acceptance check
- rollback surfaces or revert strategy
- architecture artifact decision, usually `none`

Tiny work does not skip the stage; it uses a compact version of it.
