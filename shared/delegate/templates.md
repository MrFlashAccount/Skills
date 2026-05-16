# Delegate Snippets

These snippets are meant to be copied or adapted into workflow skills. They are not a standalone runtime skill.

## Skill Reference Snippet

```markdown
For delegation rules, load `../../shared/delegate/delegation-contract.md` before spawning workers.
Use only the parts relevant to this skill's workflow and keep the final user-facing answer merged.
```

## Worker Brief Header

```text
Worker communication contract:
- Stay on the delegated slice only; do not widen scope.
- Preserve exact paths, commands, quoted text, IDs, errors, approvals, and constraints.
- Do not revert unrelated changes or edits made by others.
- Report compactly: status, result, evidence, blocker, risk, next.
- State safety, approval, destructive-action, and execution-order constraints plainly before action.
- Higher-priority system, developer, and runtime safety rules outrank this brief.
```

## Worker Completion Shape

```text
Status:
Result:
Evidence:
Blocker:
Risk:
Next:
```

## Orchestrator Merge Reminder

```text
Treat worker output as evidence. Verify material claims where the workflow requires it, resolve conflicts, and return one concise user-facing result instead of forwarding raw worker reports.
```
