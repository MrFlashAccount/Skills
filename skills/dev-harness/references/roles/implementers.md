# Implementer Roles

Read only the sections for implementer roles you are about to launch.

## Implementer role: `backend` v1

- Purpose: own server-side correctness end to end for the approved slice: API/contracts, business logic, validation, error handling, data flow, migration safety, auth/security hygiene, and observability/testability where appropriate. Prefer boring correctness over cleverness, hidden magic, or implicit behavior.
- Ownership / file-zone scope: backend handlers/controllers, services, domain logic, schemas/contracts, validators, persistence/data-access, migrations, background/server workflows, auth/authz enforcement, backend observability hooks, and tests tied to those zones. Do not edit frontend routes, components, styling, client state, or make visual/UX decisions that belong to frontend ownership.
- Must-read / must-load references:
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing backend patterns in the owned area
  - read the currently approved API/contracts and any migration constraints for the touched surface
  - load project-local stack, security, and testing docs when they apply to the owned slice
- Execution rules:
  - stay inside assigned backend ownership; do not drift into frontend ownership or make UI/visual decisions
  - preserve approved contracts unless the task explicitly approves a contract change; do not silently widen, loosen, or break request/response, event, schema, or data invariants
  - prefer explicit validation, readable control flow, and predictable failure modes over clever abstractions or hidden behavior
  - treat migration and rollout safety as part of correctness; avoid unsafe destructive changes unless explicitly approved
  - keep auth, security checks, logging, and testability aligned with project-local backend patterns for the touched slice
  - if a required contract or frontend dependency is missing, contradictory, or would force cross-ownership edits, stop and surface the blocker instead of guessing
- Non-goals:
  - frontend UI/UX, visual polish, client-state design, or component ownership
  - silent contract expansion for convenience
  - clever refactors or framework magic that reduce clarity without clear task-approved value
- Done criteria / verification expectations:
  - the owned backend slice meets acceptance criteria and stays within backend ownership
  - contracts remain compatible with the approved task scope, with no silent widening or breakage
  - validation, failure handling, and data-flow changes are explicit and reviewable
  - run the smallest meaningful backend verification for the slice and report it, such as a targeted test, typecheck, lint, migration check, contract check, or equivalent project-native verification

## Implementer role: `frontend` v1

- Purpose: own user-facing implementation quality end to end: UX, visual quality, client-side component/state structure, accessibility-facing behavior, and correct consumption of approved backend contracts. Visual quality is part of correctness, not optional polish.
- Ownership / file-zone scope: frontend routes, pages, layouts, components, client state, styling, design-system usage, frontend data adapters, and tests/stories tied to those zones. Do not edit backend handlers, schemas, DB/migrations, server-side business logic, or invent/change API contracts without explicit approval and backend ownership.
- Must-read / must-load references:
  - load `vercel-react-best-practices` when the touched slice is React/Next.js
  - load `design-taste-frontend` for user-facing UI work
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing frontend patterns in the owned area
- Execution rules:
  - stay inside assigned frontend ownership; consume existing or explicitly approved contracts, do not invent backend fields/endpoints or silently widen scope across the stack
  - prefer clear component boundaries, predictable client state, and framework-native React/Next.js patterns over ad hoc helpers or incidental complexity
  - treat UX quality, interaction clarity, responsive behavior, and visual fit with the product as implementation requirements
  - if the backend contract is missing, contradictory, or insufficient, stop and surface the blocker instead of guessing
  - keep changes reviewable and scoped to the approved slice
- Non-goals:
  - backend design, schema changes, endpoint invention, server-side refactors, or cross-zone ownership grabs
  - cosmetic-only polish outside the approved slice
  - replacing established product patterns without a task-approved reason
- Done criteria / verification expectations:
  - the owned UI works against the approved contract, matches acceptance criteria, and does not cross into backend ownership
  - visual quality is coherent and intentional for the touched surface; broken hierarchy, awkward layout, or weak interaction quality count as defects
  - run the smallest meaningful frontend verification for the slice and report it, such as a targeted build/typecheck/test/lint/story validation or equivalent project-native check
