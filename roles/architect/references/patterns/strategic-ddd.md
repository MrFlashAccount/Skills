# Strategic DDD

Use Strategic DDD when the hard architecture problem is meaning, ownership, and boundary protection across a domain. It is not a synonym for “domain folder.”

Strategic DDD says one large unified model is often unrealistic. Instead, keep models internally consistent inside bounded contexts, make each context’s language explicit, and describe how contexts relate where they integrate.

## Core shape

- **Domain model**: a conceptual model used by both software and domain discussion.
- **Ubiquitous language**: terms used consistently by code, tests, docs, and domain experts inside one context.
- **Bounded context**: the boundary inside which one model and language are coherent.
- **Polyseme**: one word with different meanings in different contexts, for example `Customer`, `Product`, `Account`, `Meter`.
- **Context relationship**: how two bounded contexts integrate, translate, depend on, or protect their models.
- **Shared kernel**: a small shared model owned jointly by contexts, with explicit coordination cost for every change.
- **Published language**: a stable integration language/API/schema that downstream contexts can rely on without importing upstream internals.
- **Anti-corruption layer**: translation code that protects a context from another model, legacy system, or vendor vocabulary.
- **Customer/supplier**: upstream supplier context serves downstream customer needs through negotiated contracts and priorities.
- **Conformist**: downstream context deliberately conforms to upstream language because translation or influence is not worth the cost.
- **Separate ways**: contexts avoid integration because coordination cost is higher than duplication or independent workflows.
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
- Human language/culture is usually the strongest boundary signal, but representation boundaries can also matter, such as in-memory model vs relational model. Persistence representation alone is not a bounded context unless it carries different language, ownership, lifecycle, invariants, or integration rules.
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

Application sketch:

- `Sales.Customer` means a buyer with quote eligibility and account-owner rules; `Support.Customer` means a contactable party with entitlement and case history.
- Keep `sales/CONTEXT.md` and `support/CONTEXT.md` with local glossary and invariants.
- Integrate through `CustomerSummaryPublishedLanguage` or an anti-corruption mapper such as `support/adapters/sales_customer_acl.py`; do not share one `Customer` class.
- Context map entry: `Support` is customer of `Sales` published customer summary; `Support` may not import `sales/internal/*`.

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

For every affected domain term/context, Architect should record the selective evidence needed for this pattern, not a mandatory proof-map for unrelated small edits:

- concept and classification: bounded context, ubiquitous term, polyseme, integration contract, read model, DTO, schema, or adapter
- owner context/module and allowed paths
- forbidden paths/layers that would merge meanings
- runtime/source entrypoint for cross-context interaction
- invariant/lifecycle per context
- schema/durable field owner
- compatibility decision for legacy shared models or aliases
- negative checks proving no internal cross-context imports

## Complete semantic transfer from source material

These notes preserve the source intent in repo-local wording so reviewers do not need to open the DDD and Bounded Context source material to understand the pattern.

### Domain model in software, not only diagrams

DDD is about building software around a model of a complex domain. The model is not just a document or up-front diagram. It lives in code, tests, conversations, names, and behavior, and it evolves as the team learns. This matters most when the domain has messy rules, ambiguous words, and competing workflows.

### Ubiquitous language

A ubiquitous language is a shared language between technical and domain people inside one bounded context. It should show up in code names, test names, docs, examples, conversations, and review comments. The point is not a central glossary for the whole company; the point is that within a boundary, the same words carry the same model.

If code uses one term, docs another, and business discussion a third, the model is not stable. If one word means different things in different workflows, the word must be bounded rather than forced into one global definition.

### Why one enterprise model fails

Large organizations often try to create one unified model of the entire domain. That breaks when different subdomains use the same words for different concepts or need different invariants. A `Customer` in sales, support, billing, and identity may have different lifecycle, fields, permissions, and responsibilities. A single shared class can become a false compromise that fits no context well.

Strategic DDD accepts that several models may coexist. Each model is coherent inside its bounded context, and integration points translate or publish stable contracts between contexts.

### Bounded context meaning

A bounded context is a boundary of model applicability. Inside it, terms, invariants, source layout, tests, data ownership, and APIs should align. Outside it, the same term may mean something else. The boundary can align with a team, subdomain, workflow, product area, service, module, or package, but it is justified by language/model coherence, not by a folder name alone.

A database schema, DTO namespace, or microservice is not automatically a bounded context. It becomes one only when it carries distinct language, ownership, invariants, lifecycle, or integration rules.

### Context map meaning

A context map records bounded contexts and the relationships between them. It is not just boxes on a diagram. It must explain how contexts depend, translate, share, conform, or stay separate. The map protects future work from accidentally merging meanings or bypassing translation.

### Relationship patterns

The relationship vocabulary matters because each relation has different coupling and ownership consequences:

- **Shared kernel**: two contexts share a small part of the model/code/schema and coordinate every change. Keep it small because shared ownership slows independent evolution.
- **Customer/supplier**: an upstream supplier serves downstream customer needs through negotiated expectations. Downstream influence and prioritization are part of the relationship.
- **Conformist**: downstream adopts upstream's model because translation, negotiation, or protection is not worth the cost. This is a deliberate surrender, not accidental leakage.
- **Published language**: contexts integrate through a stable, documented API/schema/event language that downstreams can rely on without importing upstream internals.
- **Anti-corruption layer**: a context protects its model by translating from another model, legacy system, vendor vocabulary, or upstream contract.
- **Separate ways**: contexts avoid integration when coordination is more expensive than duplication or independent workflows.
- **Open host/service style relationship**: one context exposes a protocol/API meant for multiple consumers; consumers integrate through that stable public surface rather than private internals.

### Translation over sharing

When concepts cross a context boundary, explicit translation is usually safer than shared model reuse. Translation can happen in adapters, mappers, published-language clients, ACLs, or event consumers. The key is that each context keeps its own language and invariants internally.

### Practical consequences for repo docs

When this pattern is chosen, docs must preserve:

- which terms are ambiguous/polysemic and in which contexts;
- what each bounded context owns;
- what invariants/lifecycle/data differ per context;
- which context relationships exist and why;
- where translation, published language, or ACL code lives;
- what imports or shared models are forbidden;
- what local `CONTEXT.md`, glossary, or context map must be updated;
- what legacy shared term/model is tolerated temporarily and the compatibility plan for it.

## Sources

1. Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*
2. Martin Fowler, “Bounded Context” — https://martinfowler.com/bliki/BoundedContext.html
3. Domain Language, “DDD Reference” — https://www.domainlanguage.com/ddd/reference/

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/strategic-ddd.md`

Only list this file if it was actually loaded.
