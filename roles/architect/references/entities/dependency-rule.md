# Dependency Rule

A dependency rule states which direction source-code dependencies are allowed to flow.

In Clean Architecture terms, policy-facing code should not depend on outer detail code; detail code may depend inward on policy-owned abstractions.

Use explicit `must_not_import` rules when the important constraint is a binding no-go import, such as a domain/policy module that must not import a framework/detail module or a context that must not reach into another context's internals.

## Why this term matters

- it tells planners and reviewers which arrows are legal and which are forbidden
- it is more precise than vague boundary language
- it often turns request-path, persistence-boundary, runtime, or source-layout rules into explicit dependency constraints
- it gives implementation planning and review concrete checks instead of vague boundary intent

## Common forms

- **request-path rule** — which layer or context may call which next step in the request flow
- **persistence-boundary rule** — where storage concerns may enter, and which side owns the abstraction
- **runtime rule** — which components may coordinate, schedule, publish, or invoke each other at runtime
- **must_not_import rule** — which source zones, packages, contexts, or layers must not import each other directly
- **check rule** — the grep, import-lint, dependency graph, test, or review check that can prove the rule stayed intact when such a check is available

## Use it when

- policy and detail have meaningfully different volatility
- frameworks, I/O, persistence, or transport should stay replaceable details
- the review risk is inward leakage from detail code into policy code
- a proposal needs binding no-go imports or import-export constraints reviewers can verify

## Sources

1. Robert C. Martin, "The Clean Architecture" — https://blog.cleancoder.com/uncle-bob/2011/11/22/Clean-Architecture.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/entities/dependency-rule.md`

Only list this file if it was actually loaded.
