# Hat State Machine

This skill should be treated as explicitly stateful.

## Why this needs a machine

`hat` is simple on the surface, but it still has:
- persistent conversation state
- deterministic transitions
- commands that must not accidentally change state
- switch vs clear vs status branches
- a failure mode where the assistant forgets the active lens after one or two turns

Loose prose is not enough. The skill must behave like a small command-state machine.

## Machine

States:
- `NoHat`
- `ActiveHat(role)`

Inputs:
- `Activate(role)`
- `List`
- `Status`
- `Clear`
- `Ambiguous(role_like)`

Transitions:
- `NoHat + Activate(role)` -> `ActiveHat(role)`
- `ActiveHat(old) + Activate(new)` -> `ActiveHat(new)`
- `NoHat + List` -> `NoHat`
- `ActiveHat(role) + List` -> `ActiveHat(role)`
- `NoHat + Status` -> `NoHat`
- `ActiveHat(role) + Status` -> `ActiveHat(role)`
- `NoHat + Clear` -> `NoHat`
- `ActiveHat(role) + Clear` -> `NoHat`
- `Any + Ambiguous(role_like)` -> current state unchanged until clarification

## Non-negotiables

- unclear activation never mutates state
- `List` never mutates state
- `Status` never mutates state
- `Clear` is idempotent
- switching hats is immediate
- there is never more than one active hat at a time
