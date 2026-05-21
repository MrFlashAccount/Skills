# Implementer Roles

Paths in this compact role/focus guidance are resolved relative to the `dev-harness` skill root (`skills/dev-harness/`), not relative to this reference file.

Read only the sections for implementer roles you are about to launch.

`../../roles/*/ROLE.md` and `../../roles/*/RUBRIC.md` are the only canonical role files this overlay may require directly. The sections below are routing/load guidance and compact prompt-shape guidance, not duplicated role rulebooks.

Role label alone is never sufficient. Before spawning an implementer worker/subagent, the parent must include the shared delegated role task template from [../../../../shared/delegate/delegated-role-task-template.md](../../../../shared/delegate/delegated-role-task-template.md), filled for the selected role, plus the selected compact section below.

## Common implementer prompt contract

Apply this to every code implementer prompt:

- Keep the parent/orchestrator prompt neutral and compact.
- Include only: the shared delegated role task template, selected role name/path, approved task packet, assigned file zones, scope/non-goals, verification expectations, and requested output.
- Do not inline backend-specific, frontend-specific, framework-specific, or stack-specific implementation rules into the parent prompt. Those rules belong in the loaded role material and any role-internal references it tells the worker to read.
- If a worker needs more role detail, the worker must get it by loading the selected `ROLE.md`, `RUBRIC.md`, `LEARNINGS.md` when required, and role-referenced files.
- Treat this file as routing/load guidance, not as a duplicated implementation rulebook.

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

Load `../../roles/backend/ROLE.md` and `../../roles/backend/RUBRIC.md` first. Then follow the loaded role files for `LEARNINGS.md` or other backend references they require.

Parent prompt content for this role should stay compact:

- approved task packet / acceptance criteria
- assigned backend file zones
- scope and non-goals
- relevant contract inputs named by the approved packet
- verification expectations from the task contract
- requested output format from the task contract plus loaded role material requirements

Do not paste backend implementation rules, backend checklists, or backend best-practice walls into the parent/orchestrator prompt. Backend-specific rules live in `roles/backend/ROLE.md`, `roles/backend/RUBRIC.md`, `roles/backend/LEARNINGS.md`, and backend role references.

## Implementer role: `frontend` v1

Load `../../roles/frontend/ROLE.md` and `../../roles/frontend/RUBRIC.md` first. Then follow the loaded role files for `LEARNINGS.md`, UI references, `DESIGN.md`, or other frontend/design references they require for the assigned surface.

Parent prompt content for this role should stay compact:

- approved task packet / acceptance criteria
- assigned frontend file zones
- scope and non-goals
- relevant API/client contract inputs named by the approved packet
- verification expectations from the task contract
- requested output format from the task contract plus loaded role material requirements

Do not paste frontend implementation rules, frontend checklists, framework rules, design-taste rules, or best-practice walls into the parent/orchestrator prompt. Frontend-specific rules live in `roles/frontend/ROLE.md`, `roles/frontend/RUBRIC.md`, `roles/frontend/LEARNINGS.md`, and frontend role references.
