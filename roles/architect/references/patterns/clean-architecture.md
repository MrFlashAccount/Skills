# Clean Architecture

Use Clean Architecture language when policy and detail have meaningfully different volatility and reviewers need a concrete rule about which direction dependencies may flow.

## Use it when

- frameworks, I/O, persistence, or transport should stay replaceable details
- the review risk is inward leakage from detail code into policy code
- the slice benefits from explicit source-code dependency rules rather than vague boundary talk

## Keep it lighter when

- the slice is tiny, single-owner, and has no meaningful outer-detail pressure
- extra layers would only rename pass-through code

## Practical check

If the proposed dependency rule does not forbid a concrete bad arrow, it is probably too vague to help review.

## Sources

1. Robert C. Martin, "The Clean Architecture" — https://blog.cleancoder.com/uncle-bob/2011/11/22/Clean-Architecture.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/clean-architecture.md`

Only list this file if it was actually loaded.
