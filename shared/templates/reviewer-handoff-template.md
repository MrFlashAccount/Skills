# <Project/Issue> Reviewer Handoff — <Slice>

Use this as the format/context packet passed to a reviewer. The reviewer must judge the implementation against the approved source contract, not only against green tests or general code quality.

## Status

- Owner:
- Date:
- State: Ready for review | In review | Passed | Failed | Blocked
- Repo / branch:
- Issue / PR:
- Base comparison:
- Source task/proposal/plan:
- Implementer result packet:

## Loaded / source-of-truth context

<Insert or link the exact context the reviewer must treat as binding: task statement, proposal/plan slice, implementation evidence, constraints, accepted non-goals, and prior findings.>

## Reviewer assignment

- Review focus:
- Files/zones to inspect:
- Non-goals / known accepted debt:

## Review objective

<One short paragraph: what this reviewer must prove or reject.>

## Implementation evidence to inspect

- Changed files/diff:
- Tests/checks run:
- Manual verification:
- Docs updates:
- Known gaps or accepted tradeoffs:

## Contract trace to review

| Requirement id | Source | Exact requirement / approved mapping | Implementer evidence | Reviewer check required | Verdict | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | <issue/proposal/plan> | <exact requirement text, or approved semantic mapping> | <code/test/doc refs> | <what reviewer must inspect> | pending | |
| R2 | <issue/proposal/plan> | <exact requirement text, or approved semantic mapping> | <code/test/doc refs> | <what reviewer must inspect> | pending | |

Rules:

- PASS is forbidden if any required row is missing, partial, or uses unapproved semantic substitution.
- PASS is forbidden if docs/tests/code disagree on a contract-bearing requirement.
- If the implementation intentionally satisfies a requirement through a different representation, verify the approved mapping is present and tested/documented.
- Do not convert contract failures into “should fix” unless the source row explicitly allows delay.

## Review checklist

- [ ] Source contract rows are all mapped to evidence.
- [ ] Implementation evidence matches changed files and reported checks.
- [ ] Tests/checks cover the contract-bearing behavior or explicitly justify gaps.
- [ ] Documentation matches implemented behavior where docs are contract-bearing.
- [ ] No unrelated scope or forbidden files changed.

## Required reviewer output

Return:

- overall verdict: PASS | FAIL | BLOCKED
- contract trace verdict: PASS | FAIL | BLOCKED
- issue closure verdict: closes | partially_closes | does_not_close | blocked
- must-fix findings
- should-fix findings
- can-delay findings
- unmapped requirements
- semantic substitutions: approved | unapproved | none
- evidence checked
- confidence
