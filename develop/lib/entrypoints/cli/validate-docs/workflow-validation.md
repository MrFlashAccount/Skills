# Workflow validation bundle

This folder is the canonical validation bundle for the inline workflow runtime. It is intentionally a micro-skill-like instruction bundle for this repository, not a formal OpenClaw skill.

## Canonical entrypoints

- Deterministic use-case module: `develop/lib/use-cases/workflow-validator.mjs`
- CLI wrapper: `develop/lib/bin/validate-workflow.mjs`
- Agent instructions: `develop/lib/entrypoints/cli/validate-docs/validation-agent-instructions.md`

Run the deterministic validator:

```sh
node develop/lib/bin/validate-workflow.mjs workflows/dev-harness/workflow.json
```

It is also part of:

```sh
npm run workflow:validate
npm run validate
make -C develop validate
```

## Validation layers

### 1. JSON Schema shape

The validator first checks the workflow document with the workflow JSON Schema. This catches malformed workflow structure before semantic checks run.

Workflow documents must be flat: the JSON root directly contains `name`, `version`, `start`, `done`, `blocked`, `steps`, and optional metadata such as `description` or `triggers`. Wrapped workflow documents are invalid and are rejected before semantic checks run.

Workflow-level `instruction` / `instructions` remains an optional runtime prompt capability. Do not use it for generic orchestration notes or registry metadata because it is injected into every step prompt; use metadata fields such as `description`/`triggers` or move only genuinely step-specific guidance into the relevant step `input.prompt`.

### 2. Root workflow targets

The validator checks that:

- `name` is a non-empty lowercase kebab-case identifier.
- `start` names a declared step.
- `done` names a declared step with `kind: "done"`.
- `blocked` names a declared step with `kind: "blocked"`.

### 2a. Step ids and projected state selectors

The validator checks workflow step ids and every `input.state` selector:

- declared step ids must not be reserved runtime aggregate state keys: `artifacts`, `results`, `outputs`, or `attempts`;
- selectors must be top-level workflow step ids supported by the renderer;
- selectors must name declared workflow steps;
- reserved runtime aggregate state keys are always banned as workflow step ids and projected state selectors.

### 3. Transition targets

The validator checks static and dynamic transition declarations:

- static `next` targets must name declared steps;
- every `next.match/cases` target must name a declared step;
- dynamic direct `next` expressions must be schema-covered when they come from worker output or projected input state;
- dynamic array target schemas must declare `minItems >= 1`, `uniqueItems: true`, and valid parallel fan-out/join targets;
- parallel transition items are checked with the same target rules.

### 4. Output schema availability and compile checks

For every step with `output.schema`, the validator resolves refs relative to the directory containing the active `workflow.json`. It loads the schema and confirms it compiles as JSON Schema. There is no repository-root alias and no silent fallback.

### 5. Dynamic route schema coverage

Worker-owned dynamic routing must be constrained by schema:

- `next.match` selector values must come from `enum` or `const` values in the producing schema.
- `next.cases` keys must exactly match the selector schema values.
- Direct dynamic `next` expressions must resolve from string `enum`/`const` values or array item string `enum`/`const` values.
- Every schema-declared target must be a declared workflow step.

Approval-step output routing may be unchecked by an output schema because approval values are wrapper/user-gate owned, not worker-output owned.

### 6. DevHarness output-schema annotation warnings

For DevHarness output schemas, the validator emits a non-fatal warning when a described field lacks `x-usage`. This is a narrow deterministic warning. The semantic review agent still owns annotation quality.

## Schema annotation rule

Use this split consistently:

- `description` = producer-facing instruction: how to fill/create the field.
- `x-usage` = direct imperative instruction to the agent receiving the field.
- Avoid meta, reviewer, or downstream wording in `x-usage`.
- Meaningful fields should usually have `x-usage`.

Good `x-usage` style:

- `Treat this as the frozen implementation scope.`
- `Use only these selected steps when routing implementation.`
- `Stop and report blocked if this conflicts with the approved scope.`

Avoid wording like:

- `Used by downstream reviewers.`
- `Consumer-facing context for later stages.`
- `Helps review catch scope issues.`

## Semantic review checklist

Ask the validation agent to check:

1. Dynamic routing expressions remain path-only and deterministic.
2. Every worker-owned dynamic route is constrained by its `output.schema`.
3. `match/cases` keys exactly match selector enums/consts.
4. Dynamic target schemas cannot produce arbitrary strings, duplicate branch ids, or undeclared step ids.
5. Approval routing remains wrapper-owned and does not smuggle worker output semantics.
6. Output-schema annotations follow the producer/receiver split.
7. Every meaningful projected field has useful `x-usage`, especially contract, routing, evidence, blocker, finding, selection, handoff, and review-plan fields.
8. `x-usage` uses direct commands to the receiving agent.
9. `x-usage` explains concrete receiver semantics: authoritative vs advisory, draft vs approved/final, blocker/constraint/evidence/finding, whether the field may be changed, and what not to infer.
10. Shallow/filler `x-usage`, mixed annotation slots, meta wording, and vague review jargon are flagged.
11. Generic workflow semantics stay generic; DevHarness policy belongs in DevHarness schemas or prompts, not in the generic interpreter validator.

## Maintainer hook note

The existing pre-commit hook only refreshes the vendored Ajv bundle. If workflow edits become frequent, the lightweight hook addition should be `npm run workflow:validate` before commit. Do not add agent review or formal OpenClaw skill machinery to the hook.
