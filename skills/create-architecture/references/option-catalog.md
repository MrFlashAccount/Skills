# Architecture Option Catalog

Use this file during option narrowing. The goal is not to list every pattern ever invented. The goal is to compare plausible choices against the repo's actual pressure.

For each serious option, ask:
- what pain does this relieve?
- what seams does this make explicit?
- what complexity does it introduce?
- what team discipline does it require?
- what artifacts become mandatory if chosen?
- what failure mode is most likely if applied badly here?

## Core option set

### 1. Layered architecture

Good when:
- the domain is modest
- request/response flow dominates
- the team needs clear separation without high ceremony

Pressure:
- often decays into service soup and leaky dependencies

Mandatory caution:
- define allowed layer dependencies explicitly

### 2. Clean Architecture

Good when:
- dependency direction and testability are central
- business rules need insulation from frameworks and delivery mechanisms

Pressure:
- easy to over-abstract for small repos

Mandatory caution:
- show the dependency rule and composition root, not just rings

### 3. Hexagonal / Ports & Adapters

Good when:
- the repo talks to multiple external systems
- alternative adapters or strong seam isolation matter

Pressure:
- fake ports around stable one-off integrations

Mandatory caution:
- separate real ports from hypothetical seams

### 4. Strategic DDD

Good when:
- domain boundaries, ownership, and language are the core problem
- multiple subdomains or teams interact with different models

Pressure:
- can stay too abstract if never connected to code placement

Mandatory caution:
- produce bounded contexts, context map, and ownership

### 5. Tactical DDD

Good when:
- certain contexts have rich invariants or aggregate behavior
- the model needs stronger domain language in code

Pressure:
- cargo-cult entities/repositories everywhere

Mandatory caution:
- use selectively, context by context

### 6. Context-first modular monolith

Good when:
- one deployable unit is still right
- the real need is explicit internal seams and ownership

Pressure:
- easy to claim modularity while keeping hidden cross-context reach-through

Mandatory caution:
- local `CONTEXT.md` rules and forbidden dependencies matter a lot

### 7. Vertical slice architecture

Good when:
- features are the main axis of change
- delivery speed and local reasoning matter more than global technical layers

Pressure:
- duplicated cross-cutting policy if slices are not disciplined

Mandatory caution:
- clarify what stays shared versus slice-local

### 8. Event-driven modular monolith

Good when:
- one deployable unit is fine but workflows cross contexts asynchronously
- decoupling and temporal boundaries matter

Pressure:
- event soup, weak contracts, hidden sequencing assumptions

Mandatory caution:
- define event ownership and failure handling

### 9. Service-oriented / microservices

Good when:
- independent deployment, isolation, or org structure truly demand it
- bounded contexts are already strong enough to survive separation

Pressure:
- premature distributed systems tax

Mandatory caution:
- justify the operational burden and migration path concretely

### 10. Plugin / extension architecture

Good when:
- the product needs controlled extensibility or third-party customization
- core and extension seams must stay stable

Pressure:
- unstable extension contracts and accidental core leakage

Mandatory caution:
- define extension API stability and forbidden internals

### 11. Pipeline / job-worker architecture

Good when:
- work is staged, asynchronous, or batch-heavy
- retries, scheduling, or long-running execution dominate

Pressure:
- hidden orchestration state and weak stage ownership

Mandatory caution:
- define stage contracts, idempotency, and failure routing

## Narrowing rule

Do not present more than 3 serious candidates unless the repo genuinely has multiple equally credible directions.
Always recommend one.
Always say why the other shortlisted options lost.
