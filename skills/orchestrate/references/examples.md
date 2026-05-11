# Orchestrate Examples

## Activate
- `orchestrate`
- `orchestrate on`
- `stay in orchestrator mode`
- `turn orchestration on`

## Status
- `orchestrate?`
- `are you orchestrating`
- `what's the orchestration status`

## Clear
- `orchestrate off`
- `stop orchestrating`
- `no orchestrate`

## Expected behavior examples

### Example: activate
User: `orchestrate`
Assistant: confirms orchestration mode is active. Later turns stay orchestrator-first until cleared.

### Example: repeated activate
User: `orchestrate`
Assistant: if mode is already active, says so plainly. No extra scope and no fake second mode.

### Example: status
User: `orchestrate?`
Assistant: reports whether orchestration mode is active. State unchanged.

### Example: clear
User: `orchestrate off`
Assistant: confirms orchestration mode is off and returns to normal mode.

### Example: already off
User: `orchestrate off`
Assistant: says orchestration mode is already off. State unchanged.

### Example: no sticky persistence available
User: `orchestrate on`
Assistant: says it can follow orchestration mode on this turn, but cannot guarantee sticky persistence in this environment.

### Example: status after non-sticky activation
User: `orchestrate?`
Assistant: says sticky orchestration state is not being preserved reliably here, so it cannot truthfully report a remembered active state from earlier turns.

## Adjacent non-triggers
- `составь план` -> planning request, not a mode toggle
- `разбей задачу и делегируй` -> execution request, not a sticky-mode toggle by itself
- `не лезь сразу в код` -> process preference unless the user is clearly turning orchestration mode on
- `сначала подумай как координатор` -> clarify whether this is a one-turn preference or an actual sticky `orchestrate` activation
