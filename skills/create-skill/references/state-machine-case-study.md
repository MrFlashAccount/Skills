# State-Machine Case Study

Use this case study when a skill has repeated staged handoffs and unfinished output must not leak.

## Pattern to watch for

This pattern appears when a workflow looks like:
- `draft -> critic -> revise -> critic -> final`
- or `planner -> implementer -> reviewer -> fixer -> reviewer -> done`
- or any similar loop where each stage can send the work back instead of letting it exit

If the skill also has a rule like "do not show partial output" or "only send when approved/ready", that is a strong signal that loose prose is not enough.

## Real failure mode

In the `dating` skill, the workflow already said the critic was mandatory.
But the docs still behaved like soft guidance, not an execution contract.

What went wrong:
- the skill had a writer stage and a critic stage on paper
- the agent could still compose a plausible final line early
- the turn felt "basically done" before the critic loop finished
- result: unfinished draft-like output leaked before a fresh ready verdict on that exact turn

This was not a trigger problem.
It was a completion-gate problem.

## Why a state machine was the right fix

The workflow had all the classic markers:
- repeated handoffs
- verdict-driven branching
- partial states that should stay internal
- a "ready" state that must be explicit
- turn-level freshness requirement

That makes the workflow brittle under free-form prose.

## Recommended shape

Use an explicit state machine when most of these are true:
- a stage can return `send/rewrite/kill` or equivalent verdicts
- the next step depends on that verdict
- unfinished output must not be shown
- a nearby earlier "ready" state must not count for the current turn
- loops need retry limits or escalation paths

Typical state set:
- `Input`
- `Route`
- `NeedContext`
- `Draft`
- `Review`
- `Revise`
- `NewAngle` or equivalent restart state
- `FinalPolish`
- `Ready`
- `Output`

Typical hard rules:
- nothing user-facing leaves before `Ready`
- every new turn re-enters at `Input`
- old ready states do not carry over implicitly
- each review verdict maps to one deterministic next state
- loop count or stop condition is explicit

## Smell test for skill authors

Ask these questions during skill creation:

1. Can a reviewer/reviewer-like stage reject the current output and force another pass?
2. Is there any rule that partial output must stay hidden?
3. Could the agent feel tempted to answer early because the draft already looks decent?
4. Does the workflow need a fresh ready/approval state per turn, item, or branch?
5. Would a missing stop condition create endless rewrite loops?

If the answer to several is yes, model it explicitly as a state machine.

## What to change in the skill folder

Usually the best split is:
- `SKILL.md` keeps the operator path and the fact that the workflow is stateful
- a reference file holds the actual machine contract, states, transitions, and stop rules
- review/reference files define verdicts and transition meaning
- testing docs include leakage checks, old-ready-state checks, and loop-stop checks

## Transfer pattern

This is not just for dating.
Use it for any skill with:
- draft/review/fix cycles
- planner/critic/implementer chains
- approval gates
- output that must remain internal until a terminal state
- repeated role handoffs where stage leakage would cause bad answers or bad actions
