# Structural Entity

A structural entity is an architecture-level thing the structural contract must reason about: a context, module, seam, port, adapter, boundary, record, or other owned structural unit.

In this repo, structural entities are explicitly not Researcher domain vocabulary and not Planner implementation entities such as exact classes, functions, or edit steps.

## Use it when

- the thing matters at architecture level for ownership, seam placement, dependency direction, record-keeping, or boundary decisions

## Do not use it for

- exact signatures
- pseudocode or algorithms
- implementation task lists
- generic lists of code objects without architectural consequence

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, `skills/create-architecture/references/language.md`
