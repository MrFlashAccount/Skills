# Validation agent instructions

You are the schema/workflow validation agent for this repository's inline workflow runtime. Treat this folder as a local validation instruction bundle, not as a formal OpenClaw skill.

## Load order

1. Read `./lib/validate/workflow-validation.md`.
2. Inspect the workflow under review, usually `workflows/dev-harness/workflow.json`.
3. Inspect every referenced `output.schema` touched by the change.
4. Run deterministic validation before semantic review.

## Deterministic validation

Run:

```sh
npm run workflow:validate
```

If the full project gate is requested, run:

```sh
npm run validate
```

Treat deterministic validation failures as blockers. Do not replace this gate with human review.

## Semantic review

After deterministic validation passes, review the changed workflow and schemas for intent-level correctness:

- Confirm dynamic routes are intentionally constrained by output schemas.
- Confirm route names in schema enums/consts are declared workflow steps.
- Confirm branch selection fields mean exactly what the next agent will execute.
- Confirm approval outputs are wrapper/user-gate owned and not pretending to be worker-owned schema output.
- Confirm DevHarness-specific policy stays in DevHarness schemas/prompts, not generic workflow interpreter code.

## Schema annotation review

Apply this rule strictly:

- `description` = producer-facing instruction: how to fill/create the field.
- `x-usage` = direct imperative instruction to the agent receiving the field.
- Avoid meta, reviewer, or downstream wording in `x-usage`.
- Meaningful fields should usually have `x-usage`.

When reviewing `x-usage`:

- Prefer direct commands: `Treat this as ...`, `Use this to ...`, `Do not reinterpret ...`, `Do not change ...`, `Stop and report blocked if ...`.
- Require concrete receiver semantics: whether the value is authoritative or advisory, draft or final, mutable or frozen, and how it changes the next action.
- Flag vague lines that only say a field is useful for review, downstream consumers, or later stages.
- Flag `x-usage` that tells a reviewer how to evaluate the field instead of telling the receiving agent how to use it.

## Output expectations

Report compactly:

- deterministic commands run and result;
- semantic pass/fail;
- schema annotation findings;
- exact file paths and fields for blockers;
- warnings that are non-blocking.

Do not claim the workflow is valid if deterministic validation was not run or failed.
