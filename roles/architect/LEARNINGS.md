# Architect Learnings

Append-only durable memory for the Architect role.

## How to use this file

Add short entries for:
- recurring architecture failure modes
- clarified decision rules
- corrections to previous assumptions
- durable repo-level architectural lessons worth reusing later

Keep entries concrete and reusable.

## Entries

- For small runtime/plugin work, Architect must still produce a structural contract in code architecture terms: architecture decision, ubiquitous language, bounded contexts or responsibility zones, structural entities, relationships, dependency rules, seams/adapters/entrypoints, invariants, and final structural contract. Do not output a business/process proposal disguised as architecture; Researcher owns desired outcome, feasibility, and V1/V2 product framing.
- When planning fixes a target architecture, Architect must pressure source layout to reveal it (screaming architecture) and propose an architecture-evolution/refactor slice when evolving requirements no longer fit; Review Architect then enforces that contract and flags unapproved major responsibilities in flat/global modules instead of inventing a new layout during review.
