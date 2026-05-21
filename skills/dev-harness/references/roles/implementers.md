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

Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first, then follow the loaded role files for `LEARNINGS.md` or other architecture references they require. If the task is a full architecture process/package rather than an approved artifact update for an implementation slice, stop and route through `create-architecture`.

Parent prompt content for this role should stay compact:

- approved structural contract and artifact decision
- assigned architecture-artifact file zones
- source evidence and existing artifacts named by the approved manifest
- scope and non-goals, especially excluded backend/frontend code zones
- verification expectations from the task contract
- requested output format from the task contract plus loaded role material requirements

Do not paste architecture artifact implementation rules, architecture checklists, source-layout doctrine, proposal hygiene rules, or best-practice walls into the parent/orchestrator prompt. Architecture artifact implementation rules live in `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, `roles/architect/LEARNINGS.md`, and architect role references.

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
