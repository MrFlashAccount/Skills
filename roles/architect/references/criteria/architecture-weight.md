# Architecture Weight

Architecture weight is the amount of structure the slice actually deserves.

Start with the lightest shape that still protects the real risks.

## Common weight choices

- **almost no architecture** — single-owner, local change, no durable seam or artifact pressure
- **small monolith** — one deployable unit stays right, but ownership and collocation still need explicit discipline
- **functional core, imperative shell** — rules-heavy slice with side effects pushed outward
- **ports and adapters / Clean Architecture** — dependency direction or external variation needs an earned seam
- **plugin architecture** — controlled extensibility is a product requirement
- **Strategic or Tactical DDD** — boundary, language, or rich-model pressure is real

## Escalate weight only when

- ownership boundaries are under stress
- dependency direction needs an explicit rule
- multiple real adapters, extensions, or contexts exist
- durable architecture records are required to keep the shape understandable

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
2. Repo canon: `skills/create-architecture/references/option-catalog.md`
