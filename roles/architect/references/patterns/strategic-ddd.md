# Strategic DDD

Use Strategic DDD when the hard architecture problem is meaning, ownership, and boundary protection across a domain. It is not a synonym for “domain folder.”

Strategic DDD says one large unified model is often unrealistic. Instead, keep models internally consistent inside bounded contexts, make each context’s language explicit, and describe how contexts relate where they integrate.

## Core shape

- **Domain model**: a conceptual model used by both software and domain discussion.
- **Ubiquitous language**: terms used consistently by code, tests, docs, and domain experts inside one context.
- **Bounded context**: the boundary inside which one model and language are coherent.
- **Polyseme**: one word with different meanings in different contexts, for example `Customer`, `Product`, `Account`, `Meter`.
- **Context relationship**: how two bounded contexts integrate, translate, depend on, or protect their models.
- **Context map**: a durable record of contexts and their relationships.

## Use it when

- Different teams, modules, workflows, or integrations use the same words with different meanings.
- A concept has one lifecycle/invariant set in one area and a different lifecycle/invariant set elsewhere.
- Integration requires translation between models, not just a function call.
- Boundary choices will change source layout, ownership, dependency direction, API shape, or durable docs.
- A context map would prevent future reviewers from merging meanings back together.
- The domain is large enough that total model unification is expensive, brittle, or false.

## Keep it light when

- One language and one owner fit the slice.
- The split would create folders without different meanings, invariants, teams, data ownership, or integration rules.
- The work is really dependency direction, side-effect isolation, or extension wiring rather than domain boundary design.

## Boundary rules

- A term is only ubiquitous inside its bounded context; do not assume it means the same thing elsewhere.
- Shared concepts may have different models in different contexts. Integration must map between them explicitly.
- Human language/culture is usually the strongest boundary signal, but representation boundaries can also matter, such as in-memory model vs relational model.
- Context boundaries should own source layout, docs, tests, contracts, and allowed dependency paths.
- A central domain model spanning all contexts is a risk unless the domain is genuinely small and coherent.

Binding checks:

- `must_not_import`: one context must not import another context’s internals to reuse a term or data structure.
- `must_translate`: cross-context calls crossing polysemic terms need an adapter, API, mapping layer, or published language.
- `negative_check`: rename or change one context’s internal term/field; other contexts should only break at explicit integration points.

## Source-layout rule

Good source shape:

- context-owned folders/packages with local `CONTEXT.md` or equivalent when boundary rules are durable.
- local models, tests, adapters, docs, and glossary entries collocated with their context.
- explicit integration adapters or published contracts between contexts.
- central docs route/index contexts but do not mirror all local ownership rules.

Bad source shape:

- global `domain/entities` holding every noun from every context.
- shared `Customer`, `Product`, `Order`, or `Account` model reused across contexts with different meaning.
- generic service modules that coordinate contexts while owning nobody’s language.
- context map replaced by a diagram that names boxes but omits relationship rules.

## Review checklist

- Which words are polysemic or overloaded?
- What is the bounded context for each meaning?
- What invariants/lifecycle/data owner differ between contexts?
- Which relationships exist: translation, dependency, shared kernel, published language, anti-corruption, customer/supplier, conformist, separate ways?
- Is a context map or local context doc required as durable architecture memory?
- Does source layout scream the chosen contexts?
- Are integration points explicit and testable?
- Did the design avoid DDD theater for a single-owner local change?

## Failure modes

- Vocabulary laundering: a projection, DTO, snapshot, vendor payload, or persistence row is named as a domain entity.
- Shared-model trap: one model is reused because names match, despite different invariants or lifecycle.
- Context explosion: every folder becomes a bounded context with no distinct language pressure.
- Context without relationship: boxes are named, but translation and dependency rules are absent.
- Central glossary drift: shared docs define terms globally and erase local meaning.
- Architecture silence: changed boundaries are not recorded, so later work accidentally crosses them.

## Proof-map implications

For every affected domain term/context, Architect should record:

- concept and classification: bounded context, ubiquitous term, polyseme, integration contract, read model, DTO, schema, or adapter
- owner context/module and allowed paths
- forbidden paths/layers that would merge meanings
- runtime/source entrypoint for cross-context interaction
- invariant/lifecycle per context
- schema/durable field owner
- compatibility decision for legacy shared models or aliases
- negative checks proving no internal cross-context imports

## Sources

1. Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*
2. Martin Fowler, “Bounded Context” — https://martinfowler.com/bliki/BoundedContext.html
3. Domain Language, “DDD Reference” — https://www.domainlanguage.com/ddd/reference/

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/strategic-ddd.md`

Only list this file if it was actually loaded.
