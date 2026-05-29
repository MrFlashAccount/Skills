# Workflow semantic validation

`develop/scripts/validate-workflow.mjs` is the deterministic gate for workflow documents. It validates the JSON schema first, then checks graph semantics that JSON Schema cannot express safely.

## What the deterministic validator checks

- `workflow.start`, `workflow.done`, and `workflow.blocked` point at declared steps; `done`/`blocked` point at terminal step kinds.
- Static transitions and all declared `match/cases` targets point at declared steps.
- `output.schema` files exist, are readable JSON, and compile as JSON Schema.
- Worker dynamic routing is schema-covered:
  - `next.match` selector enum/const values must exactly match declared case keys.
  - direct dynamic `next` expressions must be backed by string enum/const targets or array item enum/const targets.
  - every schema-declared target must be a declared workflow step.
- Approval-step output routing is allowed without an output schema because approval values come from the wrapper/user gate, not a worker output contract.
- DevHarness output schemas get a lightweight annotation warning when a described field has no `x-usage`. This is intentionally non-fatal and narrow; human review still owns annotation quality.

Run it directly:

```sh
node develop/scripts/validate-workflow.mjs develop/dev-harness.workflow.json
```

It is also part of:

```sh
npm run validate
make -C develop validate
```

## Maintainer hook note

The existing pre-commit hook only refreshes the vendored Ajv bundle. If workflow edits become frequent, the lightweight hook addition should be `npm run workflow:validate` before commit. Do not add agent review or OpenClaw skill machinery to the hook.

## Future schema-specialist review checklist

This is documentation only, not a skill implementation.

Ask a schema-specialist agent to check:

1. Dynamic routing expressions remain path-only and deterministic.
2. Every worker-owned dynamic route is constrained by its `output.schema`.
3. `match/cases` keys exactly match selector enums/consts.
4. Dynamic target schemas cannot produce arbitrary strings, duplicate branch ids, or undeclared step ids.
5. Approval routing remains wrapper-owned and does not smuggle worker output semantics.
6. Output-schema annotations are split by audience:
   - `description` is exclusively producer-facing: how the creating worker should fill or create the field, including required contents and creation constraints.
   - `x-usage` is exclusively receiver-facing: an imperative instruction to the agent that receives the already-produced field.
7. Every meaningful projected field has useful `x-usage` unless it is a purely technical/obvious field. Flag missing `x-usage` on contract, routing, evidence, blocker, finding, selection, handoff, or review-plan fields.
8. `x-usage` uses direct agent-addressed commands such as `Treat this as ...`, `Use this to ...`, `Do not reinterpret ...`, `Do not change ...`, `If this conflicts with ..., stop and report ...`, or `Use only these items when ...`.
9. `x-usage` explains concrete receiver semantics: authoritative routing/selection vs advisory context, draft/proposal vs approved/final contract, blocker/constraint/evidence/finding, whether the field may be changed or must be treated as frozen, how it affects the next action, and what not to infer from it.
10. Flag shallow/filler `x-usage`, missing receiver interpretation, mixed guidance in the wrong annotation slot, and jargon aimed at humans instead of the executing agent. Avoid `downstream`, `consumer-facing`, architecture/review meta-language, internal gate names, and vague lines like `use this to catch scope` unless the field is specifically for that exact concept.
11. New schemas preserve generic workflow semantics; DevHarness-specific policy belongs in DevHarness output schemas or prompts, not in the generic interpreter validator.
