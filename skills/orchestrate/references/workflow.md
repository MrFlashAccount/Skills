# Orchestrate Workflow

Use this file when the user wants a sticky orchestration-first stance for the current conversation.

## Branches

1. `activate`
2. `clear`
3. `status`

## 1. Detect the branch

Route by the user request:

- `orchestrate` or `orchestrate on` -> `activate`
- clear explicit equivalents such as `stay in orchestrator mode` or `turn orchestration on` -> `activate`
- `orchestrate off` / `stop orchestrating` / `no orchestrate` -> `clear`
- `orchestrate?` / `are you orchestrating` / `orchestration status` -> `status`

Do not treat ordinary planning, delegation, review, or coordination requests as activation unless the user is clearly toggling the sticky mode itself.
If the request is ambiguous, clarify before changing state.

## 2. Activate

When activating orchestration mode:
- if mode was off, confirm briefly that orchestration mode is now active
- if mode was already on, say it is already active and leave the state effectively unchanged
- from the same turn onward, default to orchestrator-first behavior
- keep using the right workflow skill for the actual task instead of flattening everything into generic coordination prose
- do not treat activation itself as permission to expand the task or jump into hands-on execution
- if the runtime cannot preserve sticky conversation state, say so immediately instead of claiming it is now sticky
- if sticky persistence is unavailable, later status checks must report that no reliable sticky state is being preserved rather than pretending the prior activation still holds

## 3. Clear

When the user clears orchestration mode:
- clear the orchestration state
- confirm return to normal execution stance
- stop applying orchestrator-first behavior on the same turn and later turns
- if mode was already off, say so plainly and leave state unchanged

## 4. Status

When the user asks for current orchestration state:
- report whether orchestration mode is active
- if active state cannot be trusted because the environment does not preserve it, say that clearly
- do not change state

## Review checks

A clean implementation should make it obvious:
- when orchestration mode turned on
- when it turned off
- when a status request did not mutate anything
- that orchestration mode changes execution stance, not task scope or approval boundaries
- that workflow skills still route normally under orchestration mode
