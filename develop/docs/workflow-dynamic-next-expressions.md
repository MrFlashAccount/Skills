# Dynamic `next` expressions

Workflow steps can set `next` to one whole-string expression:

```json
"next": "${{ output.selected_steps }}"
```

V1 expressions are path selectors only. They can read:

- `output`: the current worker or approval output.
- `input`: the current step's projected state from `input.state`.

Examples:

```json
"next": "${{ output.next }}"
```

```json
"next": "${{ input.planning_draft.selected_reviewers }}"
```

The resolved value is handled like static `next`: a string routes to one step, and an array routes to parallel steps. Target ids must already exist in the workflow. V1 does not support operators, functions, brackets, array indexes, partial template strings, or access to full baton state.
