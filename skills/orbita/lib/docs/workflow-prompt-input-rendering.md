# Workflow Prompt Input + Prompt Rendering Contract

## Status

- State: implemented in the v3 workflow runtime layers.
- Scope boundary: generic workflow runtime; no DevHarness-specific runtime semantics.
- Workflow authors pass prior step data through explicit `input.prompt` interpolation or dynamic `next` expressions.

## Contract

Prompt rendering is deterministic runtime behavior. The renderer consumes the current workflow step, optional `input.template`, optional `input.role`, inline `input.prompt`, output contract material, and baton state selected by explicit prompt expressions.

`input.prompt` may be a string or string array. Arrays are joined with newlines before interpolation. Supported interpolation root is `input`:

```json
{
  "input": {
    "prompt": [
      "Use the critic verdict below.",
      "${{ input.research_attack.verdict | default: \"No critic verdict yet.\" }}"
    ]
  }
}
```

The first path segment after `input.` is a workflow step id. Remaining segments are read from that step output. A missing runtime value fails unless the expression declares a `default`.

Prompt validation runs with workflow semantic validation:

- the referenced step id must exist in `workflow.steps`;
- the referenced step must declare an `output.schema`;
- the referenced path must be covered by that output schema;
- prompt paths may be optional at schema level when the prompt expression has a fallback or when runtime absence is acceptable;
- aggregate runtime keys such as `artifacts`, `results`, and `attempts` are not workflow step ids and cannot be addressed as `input.<key>`.

Dynamic `next` expressions use the same `input.<step>.<field>` syntax, but transition validation is stricter: routing expressions must reference required schema paths and must resolve to closed target schemas.

## Render-Time Prompt Input

The renderer derives prompt input context from `input.prompt` expressions. There is no separate author-owned input list. This keeps the final prompt and the actual data dependency in one place.

Examples:

- `${{ input.research_attack.verdict }}` reads `baton.state.research_attack.verdict` for interpolation.
- `${{ input.research_attack }}` reads the whole accepted output for that step.
- `${{ input.research_attack.artifacts }}` reads the step artifacts and also turns artifact paths in that field into required reads.

Absent selected step output is allowed only when the prompt expression supplies a default. Without a default, render fails with a deterministic prompt-render error.

## Required Reads

`input.role` resolves to repository-local role material:

- `roles/<role>/ROLE.md`
- `roles/<role>/RUBRIC.md`

Prompt input artifact required reads are derived only from explicit prompt references to a whole step or that step's `artifacts` field. The renderer must not scan all baton state for artifacts by default.

## Resource Resolution

`input.template`, `output.template`, and `output.schema` are resolved relative to the directory containing the active `workflow.json`. Shared resources must be referenced explicitly with normal relative paths such as `../../shared/templates/...`.

Missing or escaping files fail deterministically. The renderer performs no network IO and does not infer repository-root fallbacks for workflow-local refs.

## Ownership

- `Workflow` owns semantic validation for prompt and transition expressions.
- `Step` owns transition-time input context derived from dynamic `next` expressions.
- `prompt-render-context` owns prompt input context derived from `input.prompt`.
- `Template` owns deterministic prompt assembly.
- `state-selection` remains an internal helper for selecting baton state by step id; it is not a workflow authoring surface.
