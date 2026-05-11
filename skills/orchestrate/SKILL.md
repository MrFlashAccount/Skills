---
name: orchestrate
description: Turn sticky orchestration mode on, off, or query its status for the current conversation. Use when the user explicitly asks to enable, disable, or check orchestration mode with commands like `orchestrate`, `orchestrate on`, `orchestrate off`, `orchestrate?`, or close unambiguous equivalents such as `stay in orchestrator mode` or `stop orchestrating`. Do not trigger this skill from ordinary planning, delegation, or coordination requests unless the user is clearly toggling the mode itself. This skill is for conversation-local execution stance only; it does not replace task-specific workflow skills or relax approval rules.
---

Activate, clear, or inspect a sticky orchestration-first mode for the current conversation.
It is conversation-local state, not a cross-session identity change.

## Mode selection

Choose one branch up front:

1. `activate`
   - turn orchestration mode on
   - keep it sticky for later turns

2. `clear`
   - turn orchestration mode off
   - return to normal execution stance

3. `status`
   - report whether orchestration mode is active now

If the user intent is unclear, ask one short clarification instead of guessing.
If the environment cannot preserve sticky state across later turns, say that plainly instead of pretending it will stick.

## Sticky-state rule

This skill is stateful.

- `orchestrate` or `orchestrate on` activates orchestration mode.
- `orchestrate off`, `stop orchestrating`, or `no orchestrate` clears orchestration mode.
- `orchestrate?`, `are you orchestrating`, or `orchestration status` reports the current state without changing it.
- active mode persists across later turns in the same conversation until the user clears it or the runtime cannot preserve it.

## Core rules

- active orchestration mode changes the default execution stance to orchestrator-first.
- do not silently self-upgrade from orchestration into direct hands-on execution just because the next step looks obvious.
- do not expand scope beyond what the user asked; orchestration is about coordination, not opportunistic takeover.
- keep routing through the proper workflow skills for the real task. `orchestrate` is a coordination stance, not a replacement for skills like `create-skill`, `dev-harness`, or `code-review-orchestrator`.
- status queries must not mutate state.
- clearing orchestration mode stops the orchestrator-first stance immediately.
- orchestration mode does not override safety rules, approval rules, or tool-discipline rules.
- if the environment cannot actually remember the sticky state, say so, do not claim the mode will remain active later, and operate turn-by-turn instead of faking persistence.

## Read next

- Read `references/workflow.md` for routing and branch handling.
- Read `references/sticky-state.md` for the explicit state contract.
- Read `references/clear-and-status.md` for clear/status semantics and idempotence.
- Read `references/examples.md` for representative trigger phrases.
- Read `references/boundaries.md` for what orchestration mode does and does not authorize.
