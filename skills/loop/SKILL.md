---
name: loop
description: Agent-agnostic iteration loop for commands like "Loop: find bugs in this project", "Loop until this test passes", or "run an agent loop on this task". Use when a main orchestrator should run the same entrypoint task through fresh subagents/executors one iteration at a time, report progress after each run, and stop on completion, no progress, blocker, safety, user stop, or max iterations.
---

# Loop

Run a bounded, agent-agnostic loop where the main orchestrator delegates one task iteration at a time to a fresh subagent, executor, or worker, then decides whether another iteration is useful.

For the detailed state fields, worker prompt, and report templates, read `references/protocol.md`.

## Trigger

Use this skill when the user explicitly asks for a loop or iterative agent pass, especially:
- `Loop: find bugs in this project`
- `Loop until the failing test is fixed`
- `Run a loop over this cleanup task`
- `Keep launching workers until no new issues are found`

Do not use it for ordinary one-shot tasks unless the user requests iterative delegation or the work clearly needs repeated independent attempts.

## Inputs to capture

Before the first iteration, identify:
- `task`: exact entrypoint task to run once per iteration
- `target`: repo, path, branch, document, issue, or other scope
- `maxIterations`: default `3` unless the user sets another bounded value
- `checks`: project-appropriate verification, chosen by the orchestrator from the task context
- `stopSignals`: any user-specific success criteria, blockers, or safety limits

If a missing input makes safe execution impossible, ask one concise question instead of starting the loop.

## Protocol

1. Initialize loop state: task, target, iteration number, max iterations, last result, progress summary, open risks, stop decision.
2. For each iteration, start a fresh subagent/executor with the task, target, current state summary, constraints, expected output contract, and allowed action boundary.
3. The worker runs the entrypoint task once. It must not silently start its own unbounded loop.
4. Worker returns compact evidence: status, result, changed files or findings, verification, blocker, risk, and recommended next step.
5. Orchestrator reports progress to the user after each iteration.
6. Orchestrator decides continue or stop using the stop conditions below.
7. If continuing, update state and launch the next fresh worker with the new context.
8. End with a completion report: iterations run, final status, evidence, checks, unresolved risks, and next action.

## Stop conditions

Stop immediately when any condition is true:
- task is complete or acceptance criteria pass
- no meaningful new progress since the previous iteration
- the issue cannot be reproduced or the worker found no actionable next step
- max iterations reached
- blocker requires user input, credentials, approval, or external dependency
- user says stop, pause, or changes scope
- safety, privacy, destructive-action, financial, legal, or external-write rules require approval or refusal

## Safety and approvals

Normal agent policy still governs every iteration.
- Do not use looping to bypass approval gates, destructive-action confirmations, external-write rules, spending limits, security boundaries, or privacy constraints.
- Keep loops bounded; never interpret `Loop:` as permission for infinite autonomous execution.
- If an iteration would perform destructive, external, or sensitive action, pause and get the required approval before that action.
- Preserve exact errors, paths, IDs, commands, and user constraints when handing state to the next worker.

## Verification

Choose checks from the actual project/task, not from this skill by default. Examples: tests, lint, typecheck, build, `git diff --check`, direct inspection, reproduced issue, or rendered/manual validation. If no meaningful check can run, state why in the progress and final report.
