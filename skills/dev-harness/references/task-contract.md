# Execution Plan Contract

Use this after research has produced a human-approved research packet and, when needed, after Architect has produced the structural contract. For tiny work, this may be a compact one-paragraph or short-bullet version of the same contract.

Execution planning must be concrete enough for implementation shape, ownership, verification, and rollback. It must not become code, pseudocode, algorithms, edit recipes, or a patch plan.

## Contract

- Goal:
- Non-goals:
- Research basis:
- Structural contract: none / reference to Architect output
- Project baseline: `not-required` / `required` + current docs, meaningful source ownership zones, and gaps/deferred items
- Architecture artifact manifest: existing / required / deferred project artifacts (`ARCHITECTURE.md`, meaningful source-zone `CONTEXT.md`, ADR/migration docs, and `DESIGN.md` when UI/frontend surface is material)
- Architecture-artifact decision: `none` / `update_existing` / `create_new` + target artifact when applicable
- Proposal workspace: `none` / explicit `.proposals/<feature-slug>` request + gitignore status + cleanup/publish hygiene
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
- Documentation impact: `none` / `required`
- Documentation surfaces: file headers / public API docs / data-shape docs / lifecycle-or-invariant docs / contract notes
- Docs blocker threshold: `blocker` / `should-fix`
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
- Architecture notes: structural contract reference, project baseline, artifact manifest, seam decisions, file-zone rationale, request-path boundaries, dependency decisions

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

## Project baseline and artifact manifest

`project_baseline` is required for new project, new repo, new plugin, and architecture-sensitive work. Keep it factual and short: existing product/project docs, existing architecture/design docs, meaningful source ownership zones, relevant absence/gaps, and what is explicitly deferred. Do not turn this into Project Scaffold; scaffold work remains out of scope unless separately approved.

The architecture artifact manifest names durable artifacts that must exist, be updated, or stay deferred for the slice:

- `ARCHITECTURE.md` for selected product architecture contract and routing when required.
- Source-focused `CONTEXT.md` only for meaningful source ownership zones with real placement/dependency rules. Tests, scripts, fixtures, and tooling do not get context docs by default.
- ADRs or migration docs when the slice carries durable decision or migration pressure.
- `DESIGN.md` status when UI/frontend surface is material: existing, required through design-memory work, or explicitly out of scope/deferred. DevHarness records the condition; it does not silently implement a design or project scaffold.

Architecture artifact work may be assigned to `architect` as an artifact implementer owner. That owner is distinct from architect review and from `backend`/`frontend` code owners; it owns approved architecture artifacts only, not application code.

## Proposal workspace policy

`.proposals/` is opt-in only by explicit Sergey/user request. When approved, use exactly `.proposals/<feature-slug>/{research.md,architecture.md,implementation.md}` and ensure `.proposals/` is gitignored in the target repo. Treat these files as temporary planning workspace, not final product docs or publishable artifacts. Root `plan.md`, `architecture-proposal.md`, `implementation-proposal.md`, or other implementation proposal leftovers fail publish/PR hygiene unless explicitly approved.

Terminology:

- Researcher owns `domain_vocabulary` and known facts/evidence.
- Architect owns `structural_entities`, relationships, dependency rules, and final structural contract.
- Execution planning owns `implementation_entities` and worker handoff.

## Planner dual-pass

For non-trivial work:

1. `Planner A propose`: creates the execution contract from the human-approved research packet and structural contract when present.
2. `Planner B attack`: challenges implementation entity coverage, file-zone ownership, project baseline coverage, architecture artifact manifest, proposal-workspace hygiene, verification surfaces, rollback surfaces, sensitive surfaces, request-path/contract touchpoints, risks, and max-detail leaks.
3. Allow one bounded revise/re-review loop when the attack finds fixable gaps, unless the caller explicitly approves another.

This is the same planner role/class in an attack pass, not a separate role.

## Rules

- For non-trivial work, execution planning may start only from a human-approved research packet: wrapper `approve_as_is`, or `approve_with_changes` only after required changes are folded back in, must still be shown to the user for explicit approval.
- One agent per file zone.
- Code implementer owners must use only `backend` or `frontend` as the role label. `architect` is allowed only as an architecture artifact implementer owner for approved docs/artifacts, not backend/frontend code.
- Each owner must map to one closed, exclusive file zone. No file may belong to two owners.
- `Feature slice` is not a free-form label; use it only if it resolves to one closed file set with one owner.
- If the work cannot be partitioned cleanly, collapse ownership to one implementer instead of inventing pseudo-slices.
- One PR per semantic chunk.
- No same agent/pass may own both implementation and reviewer/critic work for the same slice. If `architect` implements architecture artifacts, architect review must be a separate reviewer pass.
- Reviewer role labels are separate from implementer labels; the only label shared across phases is `architect` for approved architecture artifact implementation, and it remains distinct from architect review.
- Freeze scope once the contract is agreed.
- If UI, interaction behavior, or component composition is materially part of the slice, the contract must explicitly say whether a `design-test` is required before implementation and whether repo `DESIGN.md` exists, is required, or is explicitly deferred/out of scope.
- For approved UI-relevant plans, `Design-test` may not stay `unknown`; resolve it to `required` or `not-required` before implementation handoff.
- When required, `design-test` should be concrete enough to guide later implementation/review: intended UI shape, required components, critical states/behavior, and notable detail expectations.
- If `Sensitive surface` is yes or uncertain, fill all sensitive-data fields before approval.
- If the slice stores or reuses user-provided data, the contract must say whether storage is one-shot or persistent, and whether explicit user consent is required.
- If the slice touches backend request-path, persistence, or async runtime behavior, the contract must say whether blocking sync I/O exists on the request path, which contract/request-shape surfaces can drift, and which docs/architecture notes must stay in sync.
- For non-trivial code changes, the contract must explicitly name which changed files require file-level headers, which exported/public surfaces require JSDoc/TSDoc, and which invariants, side effects, lifecycle details, or contract assumptions must stay documented in code.
- If an Architect pass ran, its structural contract, file-zone and seam conclusions, dependency rules, project baseline, artifact manifest, and artifact decision must be captured in `Architecture notes` rather than left implicit in chat.
- Full architecture process/package work must route through `create-architecture`; DevHarness's Architect gate is only a planning-time structural contract for an implementation slice.
- If `.proposals/` exists in scope, the contract must prove it was explicitly requested, is gitignored, follows `.proposals/<feature-slug>/{research.md,architecture.md,implementation.md}`, and will not be treated as final product documentation.

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
- Project baseline and architecture artifact manifest when required
- Proposal workspace decision and cleanup/publish hygiene
- Owner-to-zone map
- Implementation entities
- Reviewer roles and reviewer plan
- Explicit handoff notes
- Verification surfaces
- Rollback surfaces
- Documentation impact, documentation surfaces, and docs blocker threshold when code documentation is part of the done contract
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
- project baseline only when the tiny task is new-project/new-repo/new-plugin work or touches architecture artifacts

Tiny work does not skip the stage; it uses a compact version of it.
