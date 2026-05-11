# Clear and Status Semantics

Use this file for the edge cases around removing delegation mode or reporting it.

## Clear

Accepted clear intents:
- `delegate off`
- `stop delegating`
- `no delegate`

Behavior:
- if delegation mode is active, clear it and confirm return to normal mode
- if delegation mode is already off, say that it is already off and leave state unchanged

## Status

Accepted status intents include:
- `delegate?`
- `are you delegating`
- `delegation status`

Behavior:
- report whether delegation mode is active when reliable sticky state exists
- if state cannot be preserved reliably in this environment, say that clearly instead of bluffing and do not claim a remembered active/inactive state from an earlier turn
- do not change state

## Non-mutation rule

Status checks are read-only.
A user asking whether delegation mode is active must not accidentally activate, clear, or refresh it.

## Coexistence

Even while delegation mode is active:
- the assistant may still need to use other workflow skills
- approvals and safety boundaries still apply
- a clear request takes effect immediately
