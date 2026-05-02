# Verdicts

Use these verdicts narrowly and consistently.

## `approve_as_is`
Use only when:
- the task is clear enough
- the proposal is internally coherent
- acceptance is explicit enough
- research is closed enough that implementation should not need broad rediscovery
- `unresolved_blockers` is empty
- no major blocker remains hidden in `open_questions` or `missing_evidence`

## `approve_with_changes`
Use when:
- the core direction is fine
- at least one concrete fix, clarification, or simplification is still required before approval
- the remaining gaps are bounded and do not require a full new research pass
- implementation can wait until those bounded changes are folded back into the packet
- any blocking item is called out explicitly in `unresolved_blockers`

## `needs_more_research`
Use when:
- key context is missing
- the proposal depends on unverified assumptions
- the task boundary is still muddy
- answered questions would need to be reopened because the evidence is contradictory or incomplete
- critical acceptance or risk questions are unresolved
- `unresolved_blockers` contains substantive blockers that prevent responsible approval or start

## Rule of thumb

If another layer would be irresponsible to persist or route the packet straight into human approval, do not use `approve_as_is`.
