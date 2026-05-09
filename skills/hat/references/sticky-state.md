# Sticky State Contract

Use this file because `hat` is a stateful skill.

## State machine

States:
- `no_hat`
- `hat_active(<role>)`

## Transitions

- `hat <role>` from `no_hat` -> `hat_active(role)`
- `hat <role>` from `hat_active(old)` -> `hat_active(new)`
- `hat` from any state -> no state change, list roles
- `hat off` / `clear hat` / `no hat` from `hat_active(role)` -> `no_hat`
- `hat off` / `clear hat` / `no hat` from `no_hat` -> `no_hat`
- `hat?` / `which hat` / `current hat` from any state -> no state change, report state

## Hard rules

- the active hat must persist across later turns in the same conversation until explicitly changed
- the active hat is conversation-local and must not be assumed to carry across different sessions or channels unless the runtime explicitly provides that persistence
- an old hat must stop applying immediately when a new hat is activated
- clearing the hat must stop the role lens immediately
- listing roles or asking status must not change state
- a stale previously active hat must not silently survive a clear or switch

## Output behavior

When state changes, say so briefly.
When state does not change, say so plainly.
Do not produce fuzzy “sort of active” behavior.

## Fresh-turn rule

Each new turn should check the current hat state first.
If `hat_active(role)` exists, apply that role lens before forming the answer unless the current user turn changes or clears the hat.

## Persistence requirement

The skill must rely on conversation-visible sticky state, not on one-turn only phrasing.
If the environment cannot preserve the state, say so instead of pretending stickiness works.
