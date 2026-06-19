# Tactical DDD

Use Tactical DDD inside an already justified bounded context when the model has behavior, invariants, lifecycle, and consistency rules that deserve explicit domain structures.

Tactical DDD is not a folder template. Start with the context and language, then choose only the domain structures that protect real rules.

## Core shape

- **Entity**: domain object with identity, lifecycle, and invariants/behavior that remain meaningful as attributes change.
- **Value object**: immutable or value-equality concept identified by its attributes, often used to make rules explicit and avoid primitive obsession.
- **Aggregate**: consistency boundary around entities/value objects that must be changed atomically through an aggregate root.
- **Aggregate root**: the entity that controls access to the aggregate and protects its invariants.
- **Domain service**: domain operation that is meaningful in the ubiquitous language but does not naturally belong to one entity or value object.
- **Repository**: collection-like access to aggregate roots, not a generic query dumping ground.
- **Domain event**: record of something domain-significant that happened inside the context.
- **Process manager / saga**: application-level workflow that reacts to events or command results and coordinates multiple aggregates or external steps over time. It owns orchestration state, not aggregate invariants.
- **Application workflow**: handler/service logic that manages transactions, permissions, retries, I/O, and calls into domain objects without becoming the domain model.
- **Eventual consistency**: accepting that rules spanning aggregates or contexts complete through events/workflows later instead of one large transaction.

## Use it when

- Business rules are currently scattered across handlers, controllers, jobs, validators, repositories, or transaction scripts.
- Invariants need a single home and must hold across state changes.
- Identity/lifecycle matters: the same conceptual thing persists while its attributes change.
- Value concepts need validation/equality/behavior instead of primitive strings, numbers, or maps.
- A group of objects must be updated atomically under one consistency boundary.
- The context has rich language and rules; procedural glue is hiding that model.

## Anti-signals

- The slice is CRUD over simple records with no meaningful invariants beyond storage validation.
- Every table becomes an entity, every entity gets a service, and every service gets a repository.
- Aggregates are copied from database relationships instead of consistency boundaries.
- Domain services become a place to avoid putting behavior on entities/value objects.
- The bounded context and ubiquitous language are still unclear.
- The repo needs a read model, DTO, projection, snapshot, or schema, but it is being called an entity.

## Modeling rules

- A thing may be called an entity only if identity, lifecycle, and invariant-bearing behavior matter in this context.
- Prefer value objects for concepts whose attributes define equality and whose validation should travel with the value.
- Aggregates are transaction/consistency boundaries, not object graphs or ORM include trees.
- Keep aggregates as small as the true invariants allow; large clusters increase contention, loading cost, and accidental coupling.
- Cross-aggregate references should usually be by identity, not deep object references, unless a stronger local rule says otherwise.
- Rules that do not need same-transaction consistency should normally move to eventual consistency, domain events, process managers, or application workflow instead of bloating one aggregate. A process manager coordinates `OrderPlaced -> ReserveInventory -> CapturePayment -> NotifyFulfillment`; it should not reach into aggregate internals or pretend all steps are one invariant.
- Repositories load/save aggregate roots; they should not expose internals as arbitrary mutable collections.
- Domain services should express domain operations, not application orchestration or infrastructure calls.
- Application services/handlers coordinate transactions, permissions, I/O, and calls into the domain; they should not own domain invariants.

## Source-layout rule

Good source shape:

- tactical structures live inside the owning bounded context.
- entities, value objects, aggregate roots, domain services, events, and repositories are named in ubiquitous language.
- tests exercise behavior through aggregate roots or domain operations, not by mutating internals.
- persistence mappings/adapters stay outside or at the edge of the domain model unless the repo explicitly chooses active record.

Application sketch:

- `Order` aggregate root owns `place`, `cancel`, and `mark_paid` invariants for one order.
- `Money` and `Sku` are value objects because validation/equality travel with their attributes.
- `OrderRepository` loads/saves `Order` roots; query projections live outside as read models.
- `CheckoutProcessManager` reacts to `OrderPlaced`, asks inventory/payment ports through application workflow, and emits commands/events for eventual consistency rather than enlarging `Order` to include warehouse and payment state.

Bad source shape:

- global `entities/`, `repositories/`, `services/` folders shared by unrelated contexts.
- ORM annotations or persistence IDs defining the model’s conceptual identity without review.
- setters that allow invariants to be bypassed.
- repositories per table when the domain boundary is aggregate-level.
- anemic entities with all behavior in handlers or `*Service` classes.

## Review checklist

- What bounded context owns this model?
- Which terms are ubiquitous inside that context?
- Which objects have identity plus lifecycle plus invariants/behavior?
- Which concepts are value objects, records, DTOs, projections, snapshots, or schemas instead of entities?
- What aggregate boundary protects atomic consistency?
- Is the aggregate as small as possible while still enforcing the invariant?
- Which operations must go through the aggregate root?
- Which rules can be eventually consistent instead of inside the aggregate transaction?
- What belongs in a domain service, and why does it not belong on an entity/value object?
- Do tests cross the same domain boundary callers use?
- Are persistence and framework details kept from defining domain language?

## Failure modes

- Entity inflation: every noun/table/message becomes an entity without identity/lifecycle proof.
- Aggregate bloat: a whole subdomain is loaded and saved as one consistency boundary, creating contention, locking, loading cost, and coupling.
- Aggregate anemia: the root is a data bag and callers mutate internals directly.
- Repository misuse: repositories expose query-specific DTOs, persistence concerns, or child collections as if they were aggregate roots.
- Service gravity: behavior falls into domain services or application services because entities/value objects are too weak.
- Persistence model capture: ORM shape becomes the domain model and blocks better invariants.
- Tactical before strategic: entities and aggregates are designed before the context/language boundary is settled.

## Proof-map implications

For every tactical structure, Architect should record the selective evidence needed for this pattern, not a mandatory checklist for plain records or CRUD helpers:

- concept and classification: entity, value object, aggregate, aggregate root, domain service, repository, event, record, DTO, projection, schema
- owner bounded context/module and allowed paths
- forbidden paths/layers that bypass aggregate root or domain operation
- runtime/source entrypoint for state changes
- invariant/lifecycle or reason non-domain
- schema/durable fields owner and persistence mapping boundary
- compatibility decision for legacy names/wrappers
- negative checks proving invariants cannot be bypassed and non-entities are not stored under entity namespaces

## Complete semantic transfer from source material

These notes preserve the source intent in repo-local wording so reviewers do not need to open the tactical DDD source material to understand the pattern.

### Tactical patterns depend on strategic context

Tactical DDD structures are meaningful only inside a bounded context with a reasonably clear language. They are not a folder template and not a table-to-class generator. Choose them to protect rules, identity, lifecycle, and consistency in the model.

### Entity semantics

An entity is defined by continuity of identity through change. Its attributes may change, but the same conceptual thing remains the same thing in the domain. Entities usually carry lifecycle and invariant-bearing behavior. Identity can be natural, assigned, synthetic, or contextual, but it must matter to the domain model, not only to the database.

Calling a row, DTO, message, or schema object an entity is wrong when there is no domain identity/lifecycle/invariant behavior to protect.

### Value object semantics

A value object is defined by its attributes rather than identity. Two values with the same meaningful attributes are interchangeable. Value objects should generally be immutable or treated immutably, and validation/behavior should travel with the value. They are useful for money, quantities, ranges, names, identifiers-as-values, addresses, SKUs, and other concepts where primitive strings/numbers hide rules.

Value objects reduce primitive obsession and make invalid states harder to express. They should not be turned into entities just because they are stored in a table.

### Service semantics

A domain service represents a domain operation that is meaningful in the ubiquitous language but does not naturally belong to one entity or value object. It should express domain behavior, not application orchestration, transactions, permissions, retries, framework calls, or infrastructure access.

If behavior can live on an entity or value object without distorting the model, prefer that. A service bucket for all behavior creates an anemic model.

### Aggregate semantics

An aggregate is a consistency boundary. It groups entities and value objects that must be kept consistent together through one aggregate root. External callers should reference and modify the aggregate through the root, not by reaching into children and mutating internals.

Aggregates are not ORM object graphs and not “all records related by foreign keys.” Design them around invariants that must be true immediately after a transaction. Keep them as small as the true consistency rules allow, because large aggregates increase locking, contention, loading cost, and coupling.

### Aggregate root semantics

The aggregate root is the only member other objects may hold direct references to for modification. It enforces invariants and coordinates changes inside the aggregate. Repositories load and save roots. Tests should exercise state changes through the root or a domain operation that uses it, not by poking internals.

### Cross-aggregate and eventual consistency

Rules that do not require same-transaction consistency should usually leave the aggregate. Use domain events, process managers/sagas, application workflows, or eventual consistency. Cross-aggregate references should normally be by identity to avoid accidentally creating one giant transactional object graph.

A process manager coordinates a long-running workflow across aggregates or external systems. It owns orchestration state and retries, not the invariants of the aggregates it coordinates.

### Repository semantics

A repository provides collection-like access to aggregate roots. It hides persistence mechanics enough that domain code does not speak SQL/ORM/session language. It should not become a generic query dumping ground, table gateway for every child object, or source of arbitrary mutable collections. Query projections/read models can live outside repositories when they serve read concerns rather than aggregate consistency.

### Domain events

A domain event records something domain-significant that already happened inside the context. It should be named in past tense/domain language and carry enough stable information for subscribers without exposing mutable aggregate internals. Events help decouple follow-up work and enable eventual consistency, but they are not a substitute for enforcing invariants inside the aggregate that emitted them.

### Application workflow boundary

Application services, handlers, commands, or workflows manage permissions, transactions, I/O, retries, external calls, and sequencing. They call into domain objects and repositories. They should not contain the domain invariants themselves. If the only place a rule is enforced is a handler, callers can bypass it by using a different handler.

### Practical consequences for repo docs

When this pattern is chosen, docs must preserve:

- the owning bounded context and local ubiquitous language;
- which objects are entities and the identity/lifecycle proof for each;
- which concepts are value objects and their equality/validation rules;
- the aggregate boundary and immediate consistency invariant it protects;
- the aggregate root and forbidden direct mutations;
- which rules are eventual and which workflow/process manager coordinates them;
- repository scope and what query/read-model concerns stay outside;
- event names/payload ownership when events are used;
- which persistence details are intentionally outside the domain model, or where active-record coupling is an explicit repo decision.

## Sources

1. Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*
2. Vaughn Vernon, *Implementing Domain-Driven Design*
3. Martin Fowler, “Evans Classification” — https://martinfowler.com/bliki/EvansClassification.html
4. Martin Fowler, “Value Object” — https://martinfowler.com/bliki/ValueObject.html
5. Vaughn Vernon, “Effective Aggregate Design” — https://kalele.io/effective-aggregate-design/
6. Domain Language, “DDD Reference” — https://www.domainlanguage.com/ddd/reference/

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/tactical-ddd.md`

Only list this file if it was actually loaded.
