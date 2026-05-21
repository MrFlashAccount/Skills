# Context Map

A context map records bounded contexts and the relationships between them: translation, upstream/downstream influence, partnership, or other cross-context rules.

Use `CONTEXT-MAP.md` or an equivalent named artifact when the architecture question is really about how contexts meet.

## Use it when

- multiple bounded contexts interact
- context boundaries are clear enough that the important question is how they relate
- ownership or language drift appears at the seam between contexts

## Do not use it as

- a generic system landscape with no explicit context relationships
- a substitute for defining the bounded contexts themselves

## Sources

1. Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*
2. Martin Fowler, "Bounded Context" — https://martinfowler.com/bliki/BoundedContext.html

## Final role evidence

When this file is loaded as role material, add it to the final role evidence loaded list as:

- `roles/architect/references/formats/context-map.md`

Only list this file if it was actually loaded.
