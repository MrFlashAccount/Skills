---
name: hat
description: Activate, switch, list, query, or clear a sticky repo-role lens for the current conversation. Use when the user wants answers framed through one of the repo's `roles/*` such as `architect`, `critic`, or `frontend-taste`; when they say `hat <role>`; when they want to know which hat is active; or when they want to turn the hat off. This skill is for temporary role-mode routing only, not for workflow replacement or safety bypass.
---

Turn a repo role into the active sticky lens for the current conversation until it is switched or cleared.
It is conversation-local state, not a global or cross-session identity change.

## Mode selection

Choose one branch up front:

1. `activate`
   - activate a specified role
   - keep it sticky for later turns

2. `list`
   - show available repo roles
   - ask the user to choose one

3. `switch`
   - replace the current active hat with another role

4. `clear`
   - remove the current active hat
   - return to normal mode

5. `status`
   - report which hat is active now

If the role name is ambiguous, do not guess. Show close matches and ask which one to use.
If the answer can be recovered from the repo, inspect that instead of asking.
Ask one blocking question at a time.

## Sticky-state rule

This skill is stateful.

- An activated hat stays active for later turns until the user explicitly switches or clears it.
- `hat <role>` activates that role when no hat is active, or switches from the current one to the new one.
- `hat` with no role lists available roles and does not change state by itself.
- `hat off`, `clear hat`, or `no hat` clears the active hat.
- `hat?`, `which hat`, or `current hat` reports the active state without changing it.

## Core rules

- `hat` changes framing, priorities, and judgment lens, not safety rules or approval rules.
- `hat` does not replace workflow skills like `create-skill`, `create-design`, `dev-harness`, or `code-review-orchestrator`.
- Keep using the right workflow/tooling for the task; the hat only changes the specialist lens.
- Resolve hats from repo `roles/*`; do not invent roles that are not present.
- Load the role properly, including any role-local read model that affects what else must be loaded.
- If a role has richer local loading rules, follow them instead of reducing it to persona cosplay.
- If the requested role does not exist, say so plainly and offer close available roles.
- If the user switches hats, the old hat stops applying immediately.
- If the user clears the hat, stop applying specialist framing and return to the normal assistant mode.
- If wording is still bloated after the main review/fix loop, run a late-stage compression pass through `forthright` for AI-only skill material, then sanity-check that no trigger boundary, state transition, or safety rule was weakened.

## Read next

- Read `references/workflow.md` for the operating path and branch handling.
- Read `references/role-resolution.md` for name matching and repo role loading.
- Read `references/sticky-state.md` for the explicit state machine and persistence rules.
- Read `references/clear-and-switch.md` for switch/clear semantics and edge cases.
- Read `references/state-machine.md` when validating that sticky behavior cannot leak or drift.
- Read `references/examples.md` for representative trigger phrases and expected outcomes.
