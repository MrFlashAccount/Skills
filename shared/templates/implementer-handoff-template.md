# <Project/Issue> Implementer Handoff — <Slice>

Use this as the format/context packet passed to an implementer for one approved implementation slice. Fill it from the source-of-truth task, proposal/plan, review notes, and any explicit constraints. Do not use this as a new planning surface.

## Status

- Owner:
- Date:
- State: Ready for implementation | In progress | Blocked | Implemented
- Repo / branch:
- Issue / PR:
- Based on source task/proposal/plan:

## Loaded / source-of-truth context

<Insert or link the exact context the implementer must treat as binding: task statement, proposal/plan slice, prior review findings, constraints, approvals, and non-goals.>

## Implementer assignment

- Assigned file zones:
- Explicit non-goals:
- Do not edit outside:

## Implementation objective

<One short paragraph: what this implementer must make true in this slice.>

## Todo checklist

- [ ] <Concrete task tied to a requirement/source row.>
- [ ] <Concrete task tied to a required test/check/doc update.>
- [ ] <Concrete cleanup or compatibility task, if required.>

## Source contract checklist

| Requirement id | Source | Exact requirement / approved mapping | Required implementation evidence | Required test/check evidence | Required docs evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | <issue/proposal/plan/review> | <exact requirement text, or approved semantic mapping> | <code/schema/runtime artifact> | <test/check> | <doc/update or n/a> | not_started |
| R2 | <issue/proposal/plan/review> | <exact requirement text, or approved semantic mapping> | <code/schema/runtime artifact> | <test/check> | <doc/update or n/a> | not_started |

Rules:

- Treat every row in this table as a mandatory hard gate for the assigned slice, not as a preference or checklist hint.
- Do not replace source terms with “close enough” names or behavior, satisfy rows through alternate wording, or use unapproved semantic mappings unless the row includes that approved mapping.
- If a row cannot be satisfied in scope, stop and return `BLOCKED` with the exact row id, reason, and the smallest concrete approval question needed to proceed.
- If implementation discovers a contradiction with the approved plan or would require a deviation from an approved row, stop instead of redesigning silently.

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
- source contract checklist with final row statuses: `covered`, `partial`, or `blocked`
- verification run + result
- blockers
- review handoff notes

Do not claim `ready_for_review` unless every mandatory row is `covered`; `partial`, `blocked`, unmapped rows, not-applicable waivers, or rows satisfied only through unapproved alternate wording must block.
