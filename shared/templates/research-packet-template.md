# <Project/Issue> Research Packet — <Capability>

## Status

- Owner:
- Date:
- State: Draft | Ready for review | Approved | Rejected
- Decision needed:

## Executive summary

<3-6 bullets: what was learned, why it matters, and what decision this packet enables.>

## Business goal

<The outcome the project needs. Tie it to user, product, operational, or business value.>

## Problem statement

<The problem to solve, current pain, and why now. Do not describe code changes.>

## Scope

- In scope:
- Assumptions:
- Constraints:

## Non-goals

- <Explicitly excluded outcomes, audiences, systems, or decisions.>

## Stakeholders/users

| Stakeholder/user | Need | Impact |
| --- | --- | --- |
| <role/group> | <need> | <impact if solved/not solved> |

## Success criteria

- <Observable business/user/process result.>
- <Quality bar or acceptance signal.>

## Current capability assessment

<What exists today at the capability level: behavior, process, ownership, known constraints. No file-level inventory.>

## Gaps

- <Missing capability, unclear policy, ownership gap, UX/process gap, reliability gap.>

## Options considered

| Option | Summary | Pros | Cons | Fit |
| --- | --- | --- | --- | --- |
| A | <approach> | <benefits> | <tradeoffs> | Strong/Medium/Weak |
| B | <approach> | <benefits> | <tradeoffs> | Strong/Medium/Weak |

## Risks

| Risk | Impact | Likelihood | Mitigation/owner |
| --- | --- | --- | --- |
| <risk> | High/Med/Low | High/Med/Low | <mitigation or follow-up> |

## Open questions for architecture proposal

- <Question architecture must resolve before implementation planning.>

## Recommendation/readiness verdict

<Recommend one option or state why the packet is not ready. Include the minimum evidence needed to move forward.>

## Reviewer selection signal

<When a structured output schema asks for reviewer selection, mirror the selected reviewer roles here in plain language without turning this research packet into a routing or fan-out plan.>

## Artifact metadata for workflow output

When the workflow output schema includes `artifacts`, return this packet as a file-backed artifact:

```json
{
  "id": "research-packet",
  "content_type": "text/markdown",
  "path": "<stepId>/artifacts/research-packet.md",
  "summary": "Research packet for approval."
}
```

`ref` is optional/derived; omit it unless the caller explicitly needs a compact display locator. Do not add `type`, `kind`, `producer_step_id`, `version`, `replaces`, aliases, or promotion metadata.

## Template rules

- Stay at analytical research level: business goal, problem, scope, non-goals, options, risks, and open questions.
- Do not include file-level implementation details, class/method plans, imports, diffs, or command sequences.
- Do not write an architecture or implementation proposal here.
- For artifact-capable workflows, treat the markdown file as the human-facing source of truth and the JSON output as branching/context metadata.
