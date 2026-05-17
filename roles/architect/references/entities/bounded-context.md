# Bounded Context

A bounded context is a responsibility zone with its own language, rules, and ownership boundary.

Use it when the same word would otherwise mean different things in different parts of the system, or when one area must protect its model from another area’s assumptions.

## Use it when

- one area needs its own stable meanings, invariants, or ownership rules
- translation between areas is real, not cosmetic
- coupling two models directly would smear volatility or naming drift across the boundary

## Do not use it when

- the split is only folder shape or team preference
- one model and one language still serve the whole slice
- the term would add DDD theater without changing structural decisions

## Sources

1. Martin Fowler, "Bounded Context" — https://martinfowler.com/bliki/BoundedContext.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
