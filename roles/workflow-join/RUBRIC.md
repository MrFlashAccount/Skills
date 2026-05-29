# Workflow Join Rubric

Use this checklist when a workflow step aggregates selected branch outputs.

## Must pass

- Reads selected branch ids from approved workflow state.
- Confirms every selected branch output is present and schema-compatible.
- Aggregates only selected branches and preserves required evidence fields.
- Does not choose or recompute implementation work or reviewers.
- Emits only schema-compatible next targets and blocked output when aggregation is unsafe.

## Must fail

- Invents or widens selected branch scope.
- Treats unselected branch output as authoritative.
- Collapses missing, failed, or contradictory branch output into success.
- Recomputes reviewer selection outside planning.
- Emits prose instead of strict schema-compatible JSON.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/workflow-join/RUBRIC.md`
