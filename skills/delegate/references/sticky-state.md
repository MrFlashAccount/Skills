# Sticky State Contract

Use this file because `delegate` is a stateful skill.

## State machine

States:
- `normal_mode`
- `delegation_mode`

## Transitions

- `delegate` from `normal_mode` -> `delegation_mode`
- `delegate on` from `normal_mode` -> `delegation_mode`
- `delegate` from `delegation_mode` -> `delegation_mode`
- `delegate on` from `delegation_mode` -> `delegation_mode`
- `delegate off` / `stop delegating` / `no delegate` from `delegation_mode` -> `normal_mode`
- `delegate off` / `stop delegating` / `no delegate` from `normal_mode` -> `normal_mode`
- `delegate?` / `are you delegating` / `delegation status` from any state -> no state change, report state

## Hard rules

- delegation mode must persist across later turns in the same conversation when the runtime supports sticky state
- delegation mode is conversation-local and must not be assumed to carry across sessions or channels unless the runtime explicitly preserves it
- status queries must never mutate state
- clear is idempotent
- activation while already active must not widen scope or pretend a second mode exists
- if sticky persistence is unavailable, the assistant must say so explicitly instead of claiming mode is active for later turns
- activation and status wording must not overclaim persistence the runtime cannot actually provide
- if a prior activation happened in a non-sticky environment, later status checks must report that sticky state is unavailable rather than claiming active or inactive from unreliable memory

## Output behavior

When state changes, say so briefly.
When state does not change, say so plainly.
If persistence is unreliable, say that plainly and operate turn-by-turn.
Do not imply hidden persistence you do not actually have.

## Fresh-turn rule

Each new turn should check whether delegation mode is currently active.
If it is active, keep the default stance delegate-first unless the current user turn clears it.
If the environment does not preserve sticky state reliably, do not invent continuity; say that delegation can only be followed turn-by-turn in that environment.
