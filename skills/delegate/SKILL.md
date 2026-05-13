---
name: delegate
description: Turn delegation mode on, off, or report status for the current conversation when the user explicitly says `delegate`, `delegate on`, `delegate off`, `delegate?`, `stay in delegate mode`, or close equivalents. Do not trigger for ordinary planning or task coordination.
---

# Delegate

Use this only for explicit delegation-mode control.

Modes:
- `delegate` / `delegate on` / `stay in delegate mode` -> activate.
- `delegate off` / `stop delegating` / `no delegate` -> clear.
- `delegate?` / `delegation status` -> report status only.

When active:
- default to orchestrator, not direct implementer;
- delegate file edits, commands, research, implementation, and review;
- keep task-specific skills in charge of the actual work;
- before waiting on workers, say what launched and what update comes next;
- report worker failures, timeouts, or restarts instead of going silent;
- use `runTimeoutSeconds: 1200` for subagents unless a real limit says otherwise;
- return one merged user-facing result, not raw worker output;
- do not expand scope or bypass approvals;
- direct execution is allowed only when the user explicitly asks for it.

If sticky state is unavailable, say so and apply this turn-by-turn.
