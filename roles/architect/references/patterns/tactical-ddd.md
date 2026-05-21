# Tactical DDD

Use Tactical DDD inside a bounded context when the model has real invariants, lifecycle rules, or business behavior that deserves explicit domain structures.

Typical tools are entities, value objects, aggregates, and domain services, used selectively rather than sprayed across the repo.

## Use it when

- a context has rich rules that should live in the model instead of in procedural glue
- invariants need a clear home inside one context

## Anti-signals

- adding repositories, aggregates, or entities everywhere by template
- using tactical terms before the owning context and language are clear

## Sources

1. Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*
2. Vaughn Vernon, *Implementing Domain-Driven Design*

## Final role evidence

When this file is loaded as role material, add it to the final role evidence loaded list as:

- `roles/architect/references/patterns/tactical-ddd.md`

Only list this file if it was actually loaded.
