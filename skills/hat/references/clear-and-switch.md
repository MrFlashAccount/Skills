# Clear and Switch Semantics

Use this file for the edge cases around replacing or removing an active hat.

## Switch

A new `hat <role>` replaces the current active hat immediately.

Example:
- current state: `hat_active(<old-role>)`
- user: `hat <new-role>`
- new state: `hat_active(<new-role>)`

The assistant should confirm briefly that it switched from the old hat to the new one.

## Clear

Accepted clear intents:
- `hat off`
- `clear hat`
- `no hat`

Behavior:
- if a hat is active, clear it and confirm return to normal mode
- if no hat is active, say that no hat is currently active and leave state unchanged

## Status

Accepted status intents include:
- `hat?`
- `which hat`
- `current hat`

Behavior:
- return the active role name if one exists
- otherwise say no hat is active
- do not change state

## Ambiguity handling

If the user gives an unclear role name while switching:
- keep the existing hat active until the ambiguity is resolved
- ask the user to choose between the close matches
- do not silently clear or change state

## Workflow coexistence

Even while a hat is active:
- the assistant may still route through other workflow skills when the task needs them
- the hat affects framing and judgment, not the existence of process gates
- clearing or switching the hat never cancels already-required safety or approval steps
