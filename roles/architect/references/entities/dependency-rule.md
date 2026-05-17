# Dependency Rule

A dependency rule states which direction source-code dependencies are allowed to flow.

In Clean Architecture terms, policy-facing code should not depend on outer detail code; detail code may depend inward on policy-owned abstractions.

## Why this term matters

- it tells planners and reviewers which arrows are legal and which are forbidden
- it is more precise than vague boundary language
- it often turns request-path, persistence-boundary, or runtime rules into explicit dependency constraints

## Common forms

- **request-path rule** — which layer or context may call which next step in the request flow
- **persistence-boundary rule** — where storage concerns may enter, and which side owns the abstraction
- **runtime rule** — which components may coordinate, schedule, publish, or invoke each other at runtime

## Use it when

- policy and detail have meaningfully different volatility
- frameworks, I/O, persistence, or transport should stay replaceable details
- the review risk is inward leakage from detail code into policy code

## Sources

1. Robert C. Martin, "The Clean Architecture" — https://blog.cleancoder.com/uncle-bob/2011/11/22/Clean-Architecture.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
