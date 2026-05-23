# <Project/Issue> Reviewer → Implementer Handoff — <Fix Pass>

Use this when review found must-fix or contract coverage gaps and the work must go back to implementation. This is a narrow fix packet, not permission to redesign or widen scope.

## Status

- Owner:
- Date:
- State: Ready for fix pass | In progress | Fixed | Blocked
- Repo / branch:
- Issue / PR:
- Review source:
- Original implementer handoff:
- Source task/proposal/plan:

## Loaded / source-of-truth context

<Insert or link the exact context the fix implementer must treat as binding: original task/proposal/plan, reviewer findings, allowed files/zones, constraints, accepted non-goals, and required verification.>

## Fix objective

<One short paragraph: what must be fixed before re-review can pass.>

## Todo checklist

- [ ] <Fix the exact failed requirement/gap.>
- [ ] <Add or update required verification.>
- [ ] <Update docs or contract-bearing references if needed.>

## Must-fix contract gaps

| Gap id | Requirement id | Reviewer finding | Required fix outcome | Files/zones allowed | Required verification | Re-review owner |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | R1 | <what failed and evidence> | <observable fixed state> | <allowed files/zones> | <test/check/doc evidence> | <role> |
| G2 | R2 | <what failed and evidence> | <observable fixed state> | <allowed files/zones> | <test/check/doc evidence> | <role> |

## Scope guardrails

- Only fix the rows listed above.
- Do not introduce new architecture, workflow, API, or naming semantics unless the fix row explicitly requires it.
- Do not downgrade exact source terms into alternate concepts without approved mapping.
- If the fix requires scope expansion, stop as `BLOCKED` and explain the smallest re-planning question.

## Verification expected from fix pass

- Run:
  - `<targeted regression/check for each gap>`
  - `<project-native check>`
- Update docs/tests when the gap is contract-bearing.
- Return evidence per gap id.

## Output required

Return:

- summary
- gap table with statuses: `fixed`, `blocked`, or `not_applicable_with_reason`
- changed files
- verification run + result
- residual risks
- re-review handoff: reviewer roles, focus, and exact rows to re-check

Do not claim the PR is clean until a separate reviewer re-checks the fixed rows.
