# Implementer Roles

Paths in this phase overlay are resolved relative to the `dev-harness` skill root (`skills/dev-harness/`), not relative to this reference file.

Read only the sections for implementer roles you are about to launch.

`../../roles/*/ROLE.md` and `../../roles/*/RUBRIC.md` are the only canonical role files this overlay may require directly. The sections below are phase-specific implementation overlays only: ownership boundaries, execution rules, verification expectations, and implementer-specific escalation behavior. Any role-internal references or learnings must be discovered by following instructions inside the loaded role files.

Shared implementer delegation rule: each implementer section is only a phase overlay. Parent prompt must include the selected section and require direct role loading of the selected role's canonical `ROLE.md` and `RUBRIC.md`. The worker result must include `role_files_loaded`; otherwise the owned file zone remains `blocked`.

Role label alone is never sufficient. Before spawning an implementer worker/subagent, the parent must include the selected section below plus the selected role's canonical `ROLE.md` and `RUBRIC.md`. The worker must load those files before implementation, follow the loaded role files for any additional references or learnings, and return `role_files_loaded` listing `ROLE.md`, `RUBRIC.md`, and any additional files actually loaded because the role instructed it, or `blocked` if required role loading could not be completed. The parent must not accept required implementer output when this evidence is absent or mismatched.

## Common implementer quality gates

Apply these gates to every code implementer role, especially `backend` and `frontend`:

- Prefer one local responsibility per function/method: either perform side effects or compute/transform data. If a slice must mix both, keep the reason local, explicit, and easy for review to verify.
- Reuse canonical constants/names for event names, statuses, artifact kinds, action names, and similar symbolic values. Do not add raw string references outside canonical definitions, tests/fixtures, or explicitly bounded migration compatibility.
- When introducing or renaming a symbolic value, grep/check the touched area for scattered literals and consolidate them unless the exception is intentional and documented.
- Keep functions/files reviewable; extract or split when a change creates a mixed-responsibility orchestration blob or a hard-to-review surface.

## Implementer role: `architect` v1 (architecture artifacts only)

Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first, then follow the loaded role files for any additional architecture references. If the task is a full architecture process/package rather than an approved artifact update for an implementation slice, stop and route through `create-architecture`.

- Purpose: implement approved durable architecture artifacts for the slice after the Architect structural contract and artifact decision are approved. This is an artifact implementer owner, not architect review and not backend/frontend code ownership.
- Ownership / file-zone scope: `ARCHITECTURE.md`, meaningful source-zone `CONTEXT.md`, ADRs, migration docs, and architecture artifact indexes/manifests named by the approved contract. Do not edit backend/frontend application code, tests, scripts, fixtures, or unrelated docs under this role.
- Must-read / must-load references:
  - read the approved structural contract, `project_baseline`, architecture artifact manifest, and artifact decision
  - read existing architecture artifacts named by the manifest before editing or creating replacements
  - for UI/frontend surfaces, check whether `DESIGN.md` exists or is explicitly deferred/out of scope; do not create design-memory artifacts unless that work is separately approved through the design workflow
- Execution rules:
  - keep artifacts operational: ownership, placement rules, allowed modules, forbidden dependencies, dependency direction, and artifact routing over generic best practices
  - create source-focused `CONTEXT.md` only for meaningful source ownership zones with real placement/dependency rules; do not add context docs for tests, scripts, fixtures, or tooling by default
  - keep `ARCHITECTURE.md` as a selected product architecture contract and router, not a dumping ground for options or implementation recipes
  - if `.proposals/` is explicitly requested, keep it in `.proposals/<feature-slug>/{research.md,architecture.md,implementation.md}`, ensure it is gitignored, and do not treat it as final product documentation
  - root `plan.md`, `architecture-proposal.md`, `implementation-proposal.md`, or other implementation proposal leftovers must be removed or explicitly approved before publish/PR hygiene passes
  - avoid code, pseudocode, patch plans, command recipes, and unapproved scaffold work inside architecture artifacts
- Non-goals:
  - backend/frontend code implementation, tests, scripts, fixtures, or visual/design-memory authorship
  - full architecture package creation outside `create-architecture`
  - project scaffold creation unless separately approved
- Done criteria / verification expectations:
  - required architecture artifacts named by the approved contract are created or updated, and deferred artifacts are explicitly marked as deferred in the manifest/notes
  - artifact ownership is distinct from backend/frontend code owners and from architect reviewer
  - `.proposals/` and root proposal leftovers satisfy the approved hygiene rules
  - run the smallest meaningful docs/repo verification available, at least `git diff --check` when no stronger check exists

## Implementer role: `backend` v1

Load `../../roles/backend/ROLE.md` and `../../roles/backend/RUBRIC.md` first.

- Purpose: own server-side correctness end to end for the approved slice: API/contracts, business logic, validation, error handling, data flow, migration safety, auth/security hygiene, and observability/testability where appropriate. Prefer boring correctness over cleverness, hidden magic, or implicit behavior.
- Ownership / file-zone scope: backend handlers/controllers, services, domain logic, schemas/contracts, validators, persistence/data-access, migrations, background/server workflows, auth/authz enforcement, backend observability hooks, and tests tied to those zones. Do not edit frontend routes, components, styling, client state, or make visual/UX decisions that belong to frontend ownership.
- Must-read / must-load references:
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing backend patterns in the owned area
  - read the currently approved API/contracts and any migration constraints for the touched surface
  - load project-local stack, security, and testing docs when they apply to the owned slice
- Execution rules:
  - stay inside assigned backend ownership; do not drift into frontend ownership or make UI/visual decisions
  - preserve approved contracts unless the task explicitly approves a contract change; do not silently widen, loosen, or break request/response, event, schema, or data invariants
  - treat request shape, persistence semantics, and async runtime behavior as contract-adjacent; do not slip in handler/request-field drift, storage-side defaults, or background side effects without making them explicit
  - on async or request-serving paths, avoid blocking synchronous persistence/I/O unless the task explicitly allows it and the cost is called out; prefer the project-native non-blocking pattern for the touched stack
  - prefer explicit validation, readable control flow, and predictable failure modes over clever abstractions or hidden behavior
  - treat migration and rollout safety as part of correctness; avoid unsafe destructive changes unless explicitly approved
  - keep auth, security checks, logging, and testability aligned with project-local backend patterns for the touched slice
  - if code changes the real backend contract, update the contract-adjacent docs/architecture notes in-slice when they exist; do not leave docs describing an older request shape or persistence behavior
  - before finishing, ensure required file headers and language-appropriate code docs for the owned slice are present and current; if contract, lifecycle, side effects, or invariants changed in a non-obvious way, the code is incomplete until the docs reflect it
  - do not add ornamental comments; document contract-bearing behavior only
  - if a required contract or frontend dependency is missing, contradictory, or would force cross-ownership edits, stop and surface the blocker instead of guessing
- Non-goals:
  - frontend UI/UX, visual polish, client-state design, or component ownership
  - silent contract expansion for convenience
  - clever refactors or framework magic that reduce clarity without clear task-approved value
- Done criteria / verification expectations:
  - the owned backend slice meets acceptance criteria and stays within backend ownership
  - contracts remain compatible with the approved task scope, with no silent widening or breakage
  - request-path, persistence, and async-runtime behavior remain explicit and reviewable, with no unapproved blocking sync I/O on hot/request-serving paths
  - validation, failure handling, and data-flow changes are explicit and reviewable
  - contract-adjacent docs/notes named in the task contract are updated or explicitly confirmed still correct
  - required contract-significant code docs are present and current for the owned slice
  - run the smallest meaningful backend verification for the slice and report it, such as a targeted test, typecheck, lint, migration check, contract check, or equivalent project-native verification

## Implementer role: `frontend` v1

Load `../../roles/frontend/ROLE.md` and `../../roles/frontend/RUBRIC.md` first.

- Purpose: own user-facing implementation quality end to end: UX, visual quality, client-side component/state structure, accessibility-facing behavior, and correct consumption of approved backend contracts. Visual quality is part of correctness, not optional polish.
- Ownership / file-zone scope: frontend routes, pages, layouts, components, client state, styling, design-system usage, frontend data adapters, and tests/stories tied to those zones. Do not edit backend handlers, schemas, DB/migrations, server-side business logic, or invent/change API contracts without explicit approval and backend ownership.
- Must-read / must-load references:
  - follow the loaded frontend role files for any framework-specific references; do not hardcode role-internal frontend reference paths in this overlay
  - for user-facing UI work, read repo `DESIGN.md` when it exists or is named by the task contract; follow the loaded role files for any design-memory or taste references they require
  - if the task requires creating/changing design law, product basis, palette, typography, layout, density, motion law, or high-confidence screen direction, route to `create-design` before proceeding
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing frontend patterns in the owned area
- Execution rules:
  - stay inside assigned frontend ownership; consume existing or explicitly approved contracts, do not invent backend fields/endpoints or silently widen scope across the stack
  - prefer clear component boundaries, predictable client state, and framework-native React/Next.js patterns over ad hoc helpers or incidental complexity
  - treat UX quality, interaction clarity, responsive behavior, and visual fit with the product as implementation requirements
  - before finishing, ensure required file headers and language-appropriate code docs for the owned slice are present and current; if state ownership, async lifecycle, side effects, accessibility-sensitive behavior, or contract assumptions changed in a non-obvious way, the code is incomplete until the docs reflect it
  - do not add ornamental comments; document contract-bearing behavior only
  - if the backend contract is missing, contradictory, or insufficient, stop and surface the blocker instead of guessing
  - keep changes reviewable and scoped to the approved slice
- Non-goals:
  - backend design, schema changes, endpoint invention, server-side refactors, or cross-zone ownership grabs
  - cosmetic-only polish outside the approved slice
  - replacing established product patterns without a task-approved reason
- Done criteria / verification expectations:
  - the owned UI works against the approved contract, matches acceptance criteria, and does not cross into backend ownership
  - visual quality is coherent and intentional for the touched surface; broken hierarchy, awkward layout, or weak interaction quality count as defects
  - required contract-significant code docs are present and current for the owned slice
  - run the smallest meaningful frontend verification for the slice and report it, such as a targeted build/typecheck/test/lint/story validation or equivalent project-native check
