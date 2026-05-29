# Workflow Dispatch Rubric

Use this checklist when a workflow step dispatches selected branches from an approved contract.

## Must pass

- Selected branch ids come directly from approved state, not inference.
- Every selected id is a declared, canonical workflow step id.
- Route outcome exactly matches the selected unique step set.
- Duplicate or overlapping same-role work is blocked instead of expanded.
- Output JSON follows the caller's schema and uses the caller's blocked contract when dispatch cannot safely proceed.

## Must fail

- Invents a worker, reviewer, route, or step id not present in the workflow.
- Recomputes selected implementation or review scope after approval.
- Allows unknown, duplicate, or contradictory selected steps.
- Emits prose instead of strict schema-compatible JSON.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/workflow-dispatch/RUBRIC.md`
