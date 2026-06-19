# Hat Examples

## Activate
- `hat <role-name>`
- `hat <role-name-with-normalized-separators>`

## List
- `hat`

## Status
- `hat?`
- `which hat`
- `current hat`

## Switch
- `hat <another-role-name>`

## Clear
- `hat off`
- `clear hat`
- `no hat`

## Expected behavior examples

### Example: list first
User: `hat`
Assistant: lists repo roles and asks which hat to wear. State unchanged.

### Example: activate
User: `hat <role-name>`
Assistant: confirms the requested hat is active. Later turns apply that role's framing until changed.

### Example: switch
User: `hat <another-role-name>`
Assistant: confirms switch from old hat to the new one. New role framing now applies.

### Example: clear
User: `hat off`
Assistant: confirms hat removed and normal mode restored.

### Example: missing or invalid
User: `hat <missing-role>`
Assistant: says the role does not exist and offers the available role list from `scripts/list-roles.sh`. State unchanged until clarified.
