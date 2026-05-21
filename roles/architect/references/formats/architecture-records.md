# Architecture Records

Architecture records are the repo's durable memory for structural decisions, boundaries, and placement rules.

Typical records include `ARCHITECTURE.md`, local `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, and other named architecture contracts.

## Use it when

- the important part of the change is hard to recover later from code alone
- ownership, dependency rules, or artifact obligations need durable discovery
- a central index should route readers to local owning records

## Key rule

Central docs route and index. Local context docs own local rules.

## Sources

1. Michael Nygard, "Documenting Architecture Decisions" — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
2. Repo canon: `roles/architect/ROLE.md`, `skills/create-architecture/references/architecture-artifact-contract.md`

## Final role evidence

When this file is loaded as role material, add it to the final role evidence loaded list as:

- `roles/architect/references/formats/architecture-records.md`

Only list this file if it was actually loaded.
