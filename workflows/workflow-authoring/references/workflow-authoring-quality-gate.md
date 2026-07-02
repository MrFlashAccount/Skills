# Workflow Authoring Quality Gate

Before approving or implementing a workflow, read these runtime docs:

- `skills/orbita/lib/docs/workflow-prompt-input-rendering.md`
- `skills/orbita/lib/docs/workflow-dynamic-next-expressions.md`
- `skills/orbita/lib/docs/workflow-semantic-validation.md`
- `skills/orbita/lib/validate/validation-agent-instructions.md`

Use this gate for every new or materially changed workflow:

- Prompt literals that name a route or `next` target must use declared workflow step ids or schema-allowed route values exactly. Do not invent aliases that are not in the workflow.
- Dynamic `next` expressions and `match` cases must be covered by required output-schema paths with closed `const` or `enum` values.
- Top-level output-schema `required` fields must be common to all outcomes only. Put success-only fields inside the success branch. A `blocked` branch must validate with `outcome` plus `blocker` and must not require success payloads.
- Prompt-input expressions must reference real prior step ids as `${{ input.<step_id>... }}`. Non-default expressions must be covered by that step's output schema. Optional or conditionally absent step outputs must use `| default: ...`.
- Smoke evidence must exercise the workflow path that is most likely to expose prompt/schema/route drift, not only the happy path.
- Semantic review must compare `workflow.json`, every touched output schema, and worker prompt text as one contract.
