# Delegate Examples

## Activate
- `delegate`
- `delegate on`
- `stay in delegate mode`
- `turn delegation on`

## Status
- `delegate?`
- `are you delegating`
- `what's the delegation status`

## Clear
- `delegate off`
- `stop delegating`
- `no delegate`

## Expected behavior examples

### Example: activate
User: `delegate`
Assistant: confirms delegation mode is active. Later turns stay delegate-first until cleared.

### Example: repeated activate
User: `delegate`
Assistant: if mode is already active, says so plainly. No extra scope and no fake second mode.

### Example: status
User: `delegate?`
Assistant: reports whether delegation mode is active. State unchanged.

### Example: clear
User: `delegate off`
Assistant: confirms delegation mode is off and returns to normal mode.

### Example: already off
User: `delegate off`
Assistant: says delegation mode is already off. State unchanged.

### Example: no sticky persistence available
User: `delegate on`
Assistant: says it can follow delegation mode on this turn, but cannot guarantee sticky persistence in this environment.

### Example: status after non-sticky activation
User: `delegate?`
Assistant: says sticky delegation state is not being preserved reliably here, so it cannot truthfully report a remembered active state from earlier turns.

## Adjacent non-triggers
- `составь план` -> planning request, not a mode toggle
- `разбей задачу и делегируй` -> execution request, not a sticky-mode toggle by itself
- `не лезь сразу в код` -> process preference unless the user is clearly turning delegation mode on
- `сначала подумай как координатор` -> clarify whether this is a one-turn preference or an actual sticky `delegate` activation
