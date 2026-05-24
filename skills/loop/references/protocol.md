# Loop protocol reference

Use this reference when running a bounded agent-agnostic loop. Keep the visible `SKILL.md` lean; use these templates for state and handoffs.

## State fields

Track these fields in the orchestrator:

```yaml
task: "exact one-iteration entrypoint"
target: "repo/path/doc/issue/scope"
maxIterations: 3
iteration: 0
checks: ["project-appropriate verification"]
constraints: ["user constraints", "policy constraints", "repo constraints"]
progressSoFar: "compact summary of completed work/findings"
lastResult: "status/result/evidence from previous worker"
openRisks: ["unresolved risks or blockers"]
stopDecision: "continue | stop"
stopReason: "why"
```

Default `maxIterations` is `3`. The external source material inspected for this skill describes loop patterns but does not provide a default max iteration count, so this skill uses a conservative bounded default. The user may override it with another explicit bounded value.

## Worker prompt shape

Give each worker a compact contract like this, adapted to the current runtime:

```text
You are iteration {n}/{maxIterations} of a bounded loop.

Task: {task}
Target: {target}

State from previous iterations:
{progressSoFar}

Constraints:
- Run the entrypoint task once.
- Do not start your own unbounded loop.
- Preserve exact paths, commands, IDs, errors, and user constraints.
- Follow normal safety, approval, destructive-action, privacy, and external-write rules.
- Run or recommend project-appropriate checks.

Return:
- status: complete | progress | no-progress | blocked | unsafe | failed
- result: concise outcome
- evidence: files, commands, findings, or reproduction details
- checks: run / not run / why not
- blocker: missing approval/input/dependency if any
- risk: remaining risk
- next: stop or one concrete next iteration goal
```

## Progress report after each iteration

Report after every worker returns, before deciding silently to continue:

```text
Iteration {n}/{maxIterations}: {status}
Progress: {what changed or was learned}
Evidence/checks: {compact evidence}
Decision: {continue/stop} — {reason}
Next: {next iteration goal or final next step}
```

## Continue decision rubric

Continue only when all are true:
- there is a concrete next iteration goal
- the previous iteration produced progress or a new lead
- the next iteration does not require missing approval or user input
- the loop remains within the original scope
- max iterations has not been reached
- expected value justifies another worker

Stop when another iteration would mostly repeat the same attempt, widen scope without approval, or hide a blocker.

## Completion report

Final report format:

```text
Loop complete: {final status}
Iterations: {ran}/{maxIterations}
Result: {final outcome}
Evidence: {key files/findings/commands}
Checks: {what passed/failed/not run}
Stopped because: {stop reason}
Remaining risks: {risks or none}
Next: {recommended user/action step}
```

## Source inspiration

This skill was written as original repo-local guidance after inspecting ECC `continuous-agent-loop` and `autonomous-loops` material. Borrowed ideas are conceptual only: bounded orchestration, subagent waves, context bridging, quality gates, and recovery from loop churn. Runtime-specific command syntax from those sources is intentionally not required here.
