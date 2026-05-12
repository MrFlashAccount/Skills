# Architecture Grilling Question Bank

Use these questions to recover missing context after source audit. Ask only what the repo cannot already answer.
Ask one blocking question at a time.

## Problem and pressure

- What hurts today: delivery speed, correctness, testability, ownership, runtime reliability, onboarding, or all of the above?
- Which upcoming changes are most likely to break the current shape?
- Is the real ask new architecture, or better alignment between the current code and the intended structure?

## Domain and ownership

- What are the main domain concepts, and where do they currently get mixed together?
- Which teams or owners are responsible for which areas?
- Are there boundaries that should be explicit because different people make different decisions there?

## Runtime and deployment

- Is this meant to stay one deployable unit for now?
- Are there scale, latency, reliability, or isolation constraints that force certain seams?
- Which external systems are stable dependencies, and which ones vary or may multiply?

## Change surface and testing

- Where do changes currently require touching too many places?
- Which invariants are hardest to protect in tests?
- Are failures mostly inside domain rules, integration glue, orchestration, or ownership drift?

## Migration appetite

- Can the team absorb a staged migration, or does this need minimal disruption?
- Are there frozen areas we should not restructure right now?
- What is the smallest reviewable first slice that would still prove the architecture direction?

## Artifact pressure

- Which docs would actually get used here: ADR, C4, DDD map, ports/adapters view, local `CONTEXT.md` files?
- Where would one centralized architecture doc become too blunt to govern local behavior?
- Which folders or contexts need their own local rules?

## Decision gate

Before approval, make sure you can answer:
- what option is being chosen?
- what tradeoff is accepted?
- what artifacts will be created?
- what migration slices follow from that choice?
