---
name: delegate
description: Turn sticky delegation mode on, off, or query its status for the current conversation. Use when the user explicitly asks to enable, disable, or check delegation mode with commands like `delegate`, `delegate on`, `delegate off`, `delegate?`, or close unambiguous equivalents such as `stay in delegate mode` or `stop delegating`. Do not trigger this skill from ordinary planning, delegation, or coordination requests unless the user is clearly toggling the mode itself. This skill is for conversation-local execution stance only; it does not replace task-specific workflow skills or relax approval rules.
---

Activate, clear, or inspect a sticky delegation-first mode for the current conversation.
It is conversation-local state, not a cross-session identity change.

## Mode selection

Choose one branch up front:

1. `activate`
   - turn delegation mode on
   - keep it sticky for later turns

2. `clear`
   - turn delegation mode off
   - return to normal execution stance

3. `status`
   - report whether delegation mode is active now

If the user intent is unclear, ask one short clarification instead of guessing.
If the environment cannot preserve sticky state across later turns, say that plainly instead of pretending it will stick.

## Sticky-state rule

This skill is stateful.

- `delegate` or `delegate on` activates delegation mode.
- `delegate off`, `stop delegating`, or `no delegate` clears delegation mode.
- `delegate?`, `are you delegating`, or `delegation status` reports the current state without changing it.
- active mode persists across later turns in the same conversation until the user clears it or the runtime cannot preserve it.

## Core rules

- active delegation mode changes the default execution stance to delegate-first.
- do not silently self-upgrade from delegation into direct hands-on execution just because the next step looks obvious.
- do not expand scope beyond what the user asked; delegation is about coordination, not opportunistic takeover.
- keep routing through the proper workflow skills for the real task. `delegate` is a coordination stance, not a replacement for skills like `create-skill`, `dev-harness`, or `code-review-orchestrator`.
- status queries must not mutate state.
- clearing delegation mode stops the delegate-first stance immediately.
- delegation mode does not override safety rules, approval rules, or tool-discipline rules.
- if the environment cannot actually remember the sticky state, say so, do not claim the mode will remain active later, and operate turn-by-turn instead of faking persistence.

## Read next

- Read `references/workflow.md` for routing and branch handling.
- Read `references/sticky-state.md` for the explicit state contract.
- Read `references/clear-and-status.md` for clear/status semantics and idempotence.
- Read `references/examples.md` for representative trigger phrases.
- Read `references/boundaries.md` for what delegation mode does and does not authorize.
