# Boundaries and Ownership

Boundaries and ownership name which context, module, seam, document, and test surface own a piece of behavior, and where the change must stop.

Responsibility zones are only useful if a reviewer can tell both the owner and the excluded neighbors.

## Use it when

- ownership is part of the risk
- a slice crosses multiple modules or contexts
- local `CONTEXT.md`, architecture docs, or tests must have a named owner

## Anti-signals

- describing a boundary without naming an owner
- using ownership as a folder-shape guess instead of a real responsibility rule
- centralizing local rules that belong with the owning context

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
2. Repo canon: `skills/create-architecture/references/architecture-artifact-contract.md`, `skills/create-architecture/references/language.md`
