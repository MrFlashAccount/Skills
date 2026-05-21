# Architecture Artifact Contract

Use this file to decide what the architecture package must ship after approval.

## Required core

Always require these deliverables in the implemented package:

1. `ARCHITECTURE.md`
   - entrypoint artifact for the selected product architecture contract
   - states the chosen architecture direction and target source-layout shape
   - captures chosen constraints, binding rules, entity delta, entities/contexts/boundaries, dependency direction, import-export map when relevant, source-zone ownership, `must_not_import` rules, source-layout/doc deltas, and pointers to local `CONTEXT.md` docs
   - links every supporting artifact and says what each one is for

2. Architecture Decision
   - ADR-style decision record or equivalent named decision doc
   - must capture context, decision, tradeoffs, and rejected alternatives

3. C4 set
   - Context
   - Container
   - Component/Module
   - Mermaid preferred, text C4 allowed when diagrams are brittle or noisy

4. Migration / PR slicing plan
   - how to move from here to there
   - split into reviewable increments
   - include sequencing dependencies and rollback pressure where relevant
   - name the architecture checks each slice should preserve or introduce

## Required when domain and ownership boundaries matter

Add Strategic DDD:
- ubiquitous language
- bounded contexts
- context map
- ownership model

This is required whenever the architecture question is meaningfully about domain boundaries, responsibility splits, or team seams.

## Selective, not universal

Add Tactical DDD only where it clarifies actual domain mechanics:
- entities
- value objects
- aggregates
- domain services
- repositories only where justified

Do not fabricate tactical patterns across the whole repo.
Use them selectively for the contexts that need them.

## Required when architecture-sensitive triggers are present

Add `domain_source_proof_map` for affected concepts. Each entry must include:
- concept
- classification (`entity`, `value_object`, `record`, `projection`, `DTO`, `schema`, `adapter`, `compatibility_surface`, or other honest class)
- owner context/module
- allowed paths
- forbidden paths/layers
- runtime/source entrypoint
- invariant/lifecycle or reason non-domain
- schema/durable fields owner
- compatibility decision
- negative checks
- reviewer gate

Add `compatibility_surface_plan` for deprecated exports, wrappers, aliases, and legacy import paths. Each entry must include:
- surface
- decision (`delete_now`, `keep_temporarily`, or `public_exception`)
- owner
- expiry/removal condition
- imports to update
- negative check proving absence when deleted

Add fake-module/deletion proof for new or retained source zones under scrutiny: module path, owned behavior/contract/policy, runtime usage, why not folder theater, and what breaks if deleted.

## Required when dependency direction matters

Add a Clean Architecture / Ports & Adapters view:
- dependency rule
- import-export map for affected modules/packages
- inbound ports
- outbound ports
- adapters
- composition root / DI shape
- binding `must_not_import` rules and available checks

This may be a dedicated doc or an explicit section in a focused supporting artifact.
It must show what depends on what, not just name-drop the style.

## Required local context docs

For important folders or bounded contexts, add local `CONTEXT.md` docs.
Uppercase `CONTEXT.md` is the canonical default for new files. If the repo already has `Context.md`, treat that as an alternate existing spelling and follow local consistency deliberately rather than mirroring or centralizing rules.
Each one must state:
- local purpose
- owner or owning context
- language / key terms
- what belongs here
- what does not belong here
- allowed modules or inbound/outbound relationships
- forbidden dependencies
- migration notes when the folder is mid-transition

Treat these local docs as distributed source-of-truth contracts for their folders or contexts.
Keep each `CONTEXT.md` colocated with the folder/context it governs.
Related entities, ports, adapters, and local rules should stay with ownership unless there is a strong contrary constraint.
Do not centralize all folder rules into one global doc, and do not mirror local rules into central docs beyond indexing/discovery.

## Optional supporting artifacts

Add only when they remove ambiguity or keep `ARCHITECTURE.md` lean:
- `architecture/decisions/*.md`
- `architecture/c4/*.md`
- `architecture/ddd/*.md`
- `architecture/ports-and-adapters.md`
- `architecture/migration-plan.md`
- local `CONTEXT.md` files inside important folders

## Artifact map rule

If supporting docs exist, `ARCHITECTURE.md` must link them explicitly and state the role of each artifact.
`ARCHITECTURE.md` is not the place for a catalog of architecture options, generic heuristics, or best-practice encyclopedias; those belong in the Architect role and create-architecture guidance used to arrive at the selected contract.

## Common contract failures

Fail the package if it does any of these:
- no C4 set
- DDD reduced to buzzwords with no concrete contexts or tactics
- one centralized mega-doc instead of routed artifacts
- `ARCHITECTURE.md` bloated with generic option catalogs or architect lore instead of the selected contract
- folder tree frozen as doctrine without migration logic
- chosen architecture hidden behind flat/global modules instead of source zones that reveal ownership and dependency direction
- as-is inventory presented as target architecture
- ports/adapters named without dependency rule or composition root
- missing entity delta, import-export/dependency map, binding no-go imports, source-layout/doc deltas, PR slicing, or checks where the approved direction depends on them
- missing `domain_source_proof_map`, compatibility surface plan, fake-module/deletion proof, naming honesty, or schema/domain owner alignment when architecture-sensitive triggers are present
