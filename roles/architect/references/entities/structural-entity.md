# Structural Entity

A structural entity is an architecture-level thing the structural contract must reason about: a context, module, seam, port, adapter, boundary, record, or other owned structural unit.

Every architecture proposal should make the entity delta clear for affected structural entities: `added`, `changed`, `removed`, or explicitly unchanged when that boundary prevents scope creep. The delta belongs in the existing `structural_entities` section, not in a new top-level section.

In this repo, structural entities are explicitly not Researcher domain vocabulary and not Planner implementation entities such as exact classes, functions, or edit steps.

## Use it when

- the thing matters at architecture level for ownership, seam placement, source-layout placement, dependency direction, record-keeping, or boundary decisions
- the proposal needs to show what structural units are added, changed, removed, or deliberately left alone

## Do not use it for

- exact signatures
- pseudocode or algorithms
- implementation task lists
- implementation entity maps that enumerate exact classes, functions, signatures, or edit steps
- generic lists of code objects without architectural consequence

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, `skills/create-architecture/references/language.md`
