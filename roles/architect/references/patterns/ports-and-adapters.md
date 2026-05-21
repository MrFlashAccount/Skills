# Ports and Adapters

Use this pattern/form when a policy-owning context needs a stable seam across real variation, and a concrete technology or protocol must attach through that seam.

This doc intentionally keeps seam, port, and adapter guidance together to avoid over-splitting the reference set.

## Core terms in this pattern

- `seam` — where interaction crosses between contexts, modules, or external dependencies
- `port` — the interface at that seam through which a context is driven or reaches outward
- `adapter` — the concrete attachment that translates between the port’s contract and a specific framework, transport, persistence layer, or external system

Use `inbound port` for an interface that drives the context and `outbound port` for an interface the context calls outward through.

## Use it when

- a policy-owning context needs a stable interface across a real seam
- the interaction should be described by what the owning side needs, not by transport detail
- translation, mapping, or isolation from framework/detail churn is real

## Anti-signals

- creating a port only for ceremony or mockability
- adding an adapter where there is no meaningful translation or variation
- celebrating a seam that has only one hypothetical adapter and no real pressure for replacement

## Practical heuristic

One adapter is a hypothetical seam. Two adapters make the seam real.

## Sources

1. Alistair Cockburn, "Hexagonal architecture" — https://alistair.cockburn.us/hexagonal-architecture
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, `skills/create-architecture/references/language.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/ports-and-adapters.md`

Only list this file if it was actually loaded.
