# Generic Loop Protocol

This reference is the copyable protocol for `skills/loop`. It is intentionally agent-agnostic: replace "executor" with the current runtime's worker, subagent, script, or human-assisted pass.

## Iteration Baton

```yaml
loopId: "short human-readable id"
task: "original user task"
maxIterations: 3
iteration: 1
successCriteria:
  - "observable done condition"
stopConditions:
  - "max iterations"
  - "success criteria met"
  - "noProgressCount >= 2"
  - "unapproved approval boundary"
verificationRequirements:
  - "tests/checks/review to run when relevant"
lastResult:
  summary: "none yet"
  evidence: []
  artifacts: []
  verification: []
nextAction: "specific next cycle objective"
noProgressCount: 0
blocker: null
retryContext: null
approvalBoundaries:
  - "no remote push without approval"
  - "no destructive command without approval"
```

## Executor Prompt Template

```markdown
You are the executor for loop iteration {iteration}/{maxIterations}.

Task: {task}
Current baton:
{baton}

Do exactly one cycle:
1. Work only on `nextAction` unless a small prerequisite lookup is required.
2. Respect approval/safety boundaries.
3. Run configured verification when applicable and safe.
4. Report compactly, then stop. Do not start the next iteration.

Return:
- status: completed | partial | blocked | no-progress
- result:
- evidence: exact paths/commands/IDs/errors/findings
- artifacts: files/PRs/issues/notes created or changed
- verification: checks run and outcomes, or why not run
- blocker:
- next: recommended next action
```

## Orchestrator Update Template

```markdown
Iteration {n} result: {one-line summary}
Evidence: {key evidence}
Verification: {check status}
Decision: continue | retry-with-context | stop | pause-for-approval
Reason: {continuation/stop rule}
Next action: {specific next cycle objective, if continuing}
```

## Progress Accounting

Update `noProgressCount` as follows:

- Reset to `0` when the executor finds a new useful result, lands an approved change, removes a blocker, or produces new evidence that changes the next action.
- Increment by `1` when the executor repeats known information, cannot act for the same reason, or produces no actionable evidence.
- Stop at `noProgressCount >= 2` unless the user explicitly requested a larger saturation window.

## Resume Checklist

Before resuming an interrupted loop:

1. Read the last baton and final executor report.
2. Inspect current artifacts/state; do not trust stale baton entries blindly.
3. Re-run only cheap, relevant verification if state may have changed.
4. Continue from the next safe iteration, or stop/pause if an approval boundary is now active.
