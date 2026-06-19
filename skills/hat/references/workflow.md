# Hat Workflow

Use this file when the user wants the assistant to answer through one of the repo roles for the current conversation.

## Branches

1. `activate`
2. `list`
3. `switch`
4. `clear`
5. `status`

## 1. Detect the branch

Route by the user request:

- `hat <role>` -> `activate` if no hat is active, otherwise `switch`
- `hat` -> `list`
- `hat off` / `clear hat` / `no hat` -> `clear`
- `hat?` / `which hat` / `current hat` -> `status`

If the request names a role unclearly, route to clarification rather than guessing.

## 2. Activate or switch

When activating or switching:
- resolve the role against repo `../../roles/*`
- load the role files required by that role's own read model
- confirm the active hat briefly
- start applying that lens on the same turn and later turns

## 3. List

When the user says only `hat`:
- call `scripts/list-roles.sh` from the hat skill root
- list the available roles using the script's `name - description` output
- ask the user which hat they want
- do not change state yet

## 4. Clear

When the user clears the hat:
- clear the active role state
- confirm return to normal mode
- stop applying any prior role lens on the same turn and later turns

## 5. Status

When the user asks for current hat state:
- report the active hat if one exists
- otherwise say no hat is active
- do not change state

## Boundaries

- Do not let the hat replace required workflow routing.
- Do not let role framing override safety, approval, or tool-discipline rules.
- Do not hardcode a role list when the repo can be inspected directly.
- Do not maintain a manual full role list; use `scripts/list-roles.sh` for full list display.
- Do not silently keep a stale hat after the user switches or clears it.

## Review checks

A clean implementation should make it obvious:
- which hat is active
- when state changes
- when state does not change
- what happens on ambiguous role names
- that hats are role lenses, not workflow replacements
