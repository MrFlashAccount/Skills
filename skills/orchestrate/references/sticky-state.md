# Sticky State Contract

Use this file because `orchestrate` is a stateful skill.

## State machine

States:
- `normal_mode`
- `orchestration_mode`

## Transitions

- `orchestrate` from `normal_mode` -> `orchestration_mode`
- `orchestrate on` from `normal_mode` -> `orchestration_mode`
- `orchestrate` from `orchestration_mode` -> `orchestration_mode`
- `orchestrate on` from `orchestration_mode` -> `orchestration_mode`
- `orchestrate off` / `stop orchestrating` / `no orchestrate` from `orchestration_mode` -> `normal_mode`
- `orchestrate off` / `stop orchestrating` / `no orchestrate` from `normal_mode` -> `normal_mode`
- `orchestrate?` / `are you orchestrating` / `orchestration status` from any state -> no state change, report state

## Hard rules

- orchestration mode must persist across later turns in the same conversation when the runtime supports sticky state
- orchestration mode is conversation-local and must not be assumed to carry across sessions or channels unless the runtime explicitly preserves it
- status queries must never mutate state
- clear is idempotent
- activation while already active must not widen scope or pretend a second mode exists
- if sticky persistence is unavailable, the assistant must say so explicitly instead of claiming mode is active for later turns
- if a prior activation happened in a non-sticky environment, later status checks must report that sticky state is unavailable rather than claiming active or inactive from unreliable memory

## Output behavior

When state changes, say so briefly.
When state does not change, say so plainly.
Do not imply hidden persistence you do not actually have.

## Fresh-turn rule

Each new turn should check whether orchestration mode is currently active.
If it is active, keep the default stance orchestrator-first unless the current user turn clears it.
If the environment does not preserve sticky state reliably, do not invent continuity; say that orchestration can only be followed turn-by-turn in that environment.
