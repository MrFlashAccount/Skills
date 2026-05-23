# <Project/Issue> Implementer Handoff — <Slice>

Use this when an approved implementation plan is being handed to an implementer worker. Fill it from the approved research packet, architecture proposal, implementation plan, and any reviewer/fix notes. Do not use this as a new planning surface.

## Status

- Owner:
- Date:
- State: Ready for implementation | In progress | Blocked | Implemented
- Repo / branch:
- Issue / PR:
- Based on approved research packet:
- Based on approved architecture proposal:
- Based on approved implementation plan:

## Implementer assignment

- Implementer role: backend | frontend | architect-artifact
- Role material to load:
- Assigned file zones:
- Explicit non-goals:
- Do not edit outside:

## Implementation objective

<One short paragraph: what this implementer must make true in this slice.>

## Source contract checklist

| Requirement id | Source | Exact requirement / approved mapping | Required implementation evidence | Required test/check evidence | Required docs evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | <issue/proposal/plan/review> | <exact requirement text, or approved semantic mapping> | <code/schema/runtime artifact> | <test/check> | <doc/update or n/a> | not_started |
| R2 | <issue/proposal/plan/review> | <exact requirement text, or approved semantic mapping> | <code/schema/runtime artifact> | <test/check> | <doc/update or n/a> | not_started |

Rules:

- Treat this table as binding for the assigned slice.
- Do not replace source terms with “close enough” names or behavior unless the row includes an approved mapping.
- If a row cannot be satisfied in scope, stop and return `BLOCKED` with the exact row id and reason.
- If implementation discovers a contradiction with the approved plan, stop instead of redesigning silently.

## Workstream tasks

- In `<file/zone>`, add/change `<entity/behavior>` so that `<requirement id>` is satisfied.
- Preserve `<boundary/invariant/compatibility rule>`.
- Update `<test/doc/check>` required by the source contract checklist.

## Verification expected from implementer

- Run:
  - `<targeted test/check>`
  - `<project-native check>`
- Also report:
  - rows fully satisfied
  - rows blocked or partial
  - files changed
  - any approved mapping used

## Output required

Return:

- summary
- changed files
- source contract checklist with final row statuses: `covered`, `partial`, `blocked`, or `not_applicable_with_reason`
- verification run + result
- blockers
- review handoff notes

Do not claim `ready_for_review` while any required row is `partial`, `blocked`, or unmapped.
