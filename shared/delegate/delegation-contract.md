# Delegation Contract

Use this contract when a skill or workflow runs as an orchestrator and delegates work to worker/subagent sessions.

## Principles

- The orchestrator owns the user-facing result.
- Workers own only their delegated slice.
- Delegation must not expand scope, bypass approvals, or weaken safety constraints.
- Task-specific skills remain in charge of the work they are specialized for.
- Worker output is evidence for synthesis, not raw text to forward blindly.
- Direct execution is allowed only when the user explicitly asks for it or when the governing workflow permits it.

## Mode Semantics

Use delegation behavior only when explicitly requested by the user or required by the current workflow.

Explicit delegation-mode phrases may include:
- `delegate`
- `delegate on`
- `stay in delegate mode`
- `delegate off`
- `stop delegating`
- `no delegate`
- `delegate?`
- `delegation status`

If sticky state is unavailable, say so and apply the mode turn-by-turn.

## Active Delegation Behavior

When delegation is active:

- default to orchestrator, not direct implementer;
- delegate file edits, commands, research, implementation, and review when the work is meaningfully sliceable;
- keep task-specific skills in charge of the actual work;
- before waiting on workers, say what launched and what update comes next;
- report worker failures, timeouts, or restarts instead of going silent;
- use `runTimeoutSeconds: 1200` for subagents unless a real limit says otherwise;
- return one merged user-facing result, not raw worker output;
- do not expand scope or bypass approvals;
- direct execution is allowed only when the user explicitly asks for it.

## Worker Communication Contract

Give each worker a bounded brief that includes:

- assigned slice and ownership boundary;
- exact paths, commands, quoted text, IDs, errors, approvals, and constraints that matter;
- instruction to avoid unrelated files and not revert others' work;
- required report fields: status, result, evidence, blocker, risk, next;
- safety, approval, destructive-action, and execution-order constraints;
- statement that higher-priority system, developer, and runtime safety rules outrank the brief.

Workers should report compactly. The orchestrator should synthesize, verify when needed, and produce the final answer.
