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
- Architecture proposals must be reviewable without becoming Planner output: enrich the existing 13 sections with entity delta, import-export/dependency direction, source-layout and doc deltas, binding `must_not_import` rules, PR slicing constraints, and architecture checks, but avoid exact signatures, pseudocode, patch recipes, and implementation entity maps.
- Final Architect review after fix loops must re-check contract/docs drift: changed runtime/user-visible contracts, workflow states, schemas, artifacts, symbolic lifecycle values, and process contracts have to agree across implementation, tests/checks, and docs before the review can pass.

## Final role evidence

When this learning file is actually loaded, include this `LEARNINGS.md` in final role evidence.
