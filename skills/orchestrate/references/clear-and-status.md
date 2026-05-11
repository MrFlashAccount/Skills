# Clear and Status Semantics

Use this file for the edge cases around removing orchestration mode or reporting it.

## Clear

Accepted clear intents:
- `orchestrate off`
- `stop orchestrating`
- `no orchestrate`

Behavior:
- if orchestration mode is active, clear it and confirm return to normal mode
- if orchestration mode is already off, say that it is already off and leave state unchanged

## Status

Accepted status intents include:
- `orchestrate?`
- `are you orchestrating`
- `orchestration status`

Behavior:
- report whether orchestration mode is active when reliable sticky state exists
- if state cannot be preserved reliably in this environment, say that clearly instead of bluffing and do not claim a remembered active/inactive state from an earlier turn
- do not change state

## Non-mutation rule

Status checks are read-only.
A user asking whether orchestration mode is active must not accidentally activate, clear, or refresh it.

## Coexistence

Even while orchestration mode is active:
- the assistant may still need to use other workflow skills
- approvals and safety boundaries still apply
- a clear request takes effect immediately
