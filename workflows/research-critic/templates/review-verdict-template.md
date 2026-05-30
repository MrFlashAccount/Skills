# <Project/Issue> Review Verdict — <Gate>

Use this as the expected worker answer format for critic/reviewer gates. Keep it compact and evidence-based.

## Status

- Reviewer:
- Date:
- Gate: research critic | architecture review | plan review | implementation review
- Verdict: approved | needs_revision | passed | needs_changes | blocked

## Summary

<1-3 bullets with the decision and why.>

## Evidence checked

- <Source packet/artifact, diff, test output, doc, or command result inspected.>

## Findings

| Severity | Finding | Evidence | Required next action |
| --- | --- | --- | --- |
| must_fix | <gap/blocker> | <exact evidence> | <required change or decision> |
| should_fix | <non-blocking risk> | <exact evidence> | <suggested change> |

## Transition output

- outcome: approved | needs_revision | ready_for_review | passed | needs_changes | blocked
- blocker: <only when blocked>
- artifacts/results to carry forward: <refs or summaries>

## Template rules

- Do not include code, diffs, command sequences, or implementation recipes.
- Tie every blocking finding to evidence.
- Keep transition labels aligned with the current workflow edge map.
