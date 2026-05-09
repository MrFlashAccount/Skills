# Hat Examples

## Activate
- `hat architect`
- `hat frontend-taste`
- `hat critic`

## List
- `hat`

## Status
- `hat?`
- `which hat`
- `current hat`

## Switch
- `hat backend`
- `hat techwriter`

## Clear
- `hat off`
- `clear hat`
- `no hat`

## Expected behavior examples

### Example: list first
User: `hat`
Assistant: lists repo roles and asks which hat to wear. State unchanged.

### Example: activate
User: `hat architect`
Assistant: confirms architect hat is active. Later turns apply architectural framing until changed.

### Example: switch
User: `hat critic`
Assistant: confirms switch from old hat to critic. Critic framing now applies.

### Example: clear
User: `hat off`
Assistant: confirms hat removed and normal mode restored.

### Example: ambiguous
User: `hat writer`
Assistant: offers close matches such as `DevRel` or `TechWriter` if those exist. State unchanged until clarified.
