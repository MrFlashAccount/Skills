# <Project/Issue> Reviewer → Implementer Handoff — <Fix Pass>

Use this when review found must-fix or contract coverage gaps and the work must go back to implementation. This is a narrow fix prompt, not permission to redesign or widen scope.

This handoff is not a role prompt by itself. The orchestrator must pass a filled [`role-invocation-template.md`](role-invocation-template.md) with this packet so the fix worker receives the canonical delegated role call from [`../delegate/delegated-role-task-template.md`](../delegate/delegated-role-task-template.md) plus the selected implementer role material path.

## Status

- Owner:
- Date:
- State: Ready for fix pass | In progress | Fixed | Blocked
- Repo / branch:
- Issue / PR:
- Review source:
- Original implementer handoff:
- Approved implementation plan:

## Role invocation to pass

Fill and inject [`role-invocation-template.md`](role-invocation-template.md) for the fix implementer.

- Delegated implementer role:
- Primary role material path:
- Additional role/rubric/reference paths required by that role:
- Source handoff packet: this reviewer-to-implementer handoff
- Output contract: fix-pass output required below

Do not copy implementer role instructions into this handoff. Pass the role invocation and let the worker load the selected role material.

## Fix objective

<One short paragraph: what must be fixed before re-review can pass.>

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
