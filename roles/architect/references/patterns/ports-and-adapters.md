# Ports and Adapters

Use Ports and Adapters when the architecture problem is an inside/outside boundary: application policy must be driven by different outside actors, or must call outside resources, without letting those outside technologies define the application model.

Also called Hexagonal Architecture. The hexagon is only a drawing device: it reminds reviewers that an application may have more than a top UI and bottom database, and that every outside technology attaches through a purpose-named boundary.

## Core shape

- **Inside**: application behavior, use cases, business rules, and semantically meaningful operations.
- **Port**: a purposeful conversation at the application boundary, described in application terms.
- **Adapter**: technology-specific translation between a port and an outside actor, framework, protocol, database, test harness, batch job, or another application.
- **Primary / driving side**: actors that trigger application behavior: UI, HTTP, CLI, scheduler, test script, batch driver, another program.
- **Secondary / driven side**: things the application calls to answer, persist, notify, publish, or retrieve: database, mailer, queue, payment API, filesystem, model provider.
- **Inbound vs outbound mapping**: primary/driving adapters enter through inbound ports; secondary/driven adapters implement outbound ports the inside calls. Use one vocabulary consistently in the proof map.

A port is not “an interface because interfaces are good.” It is the contract for a conversation the application can have while staying ignorant of the device or protocol on the other side.

## Use it when

- UI, transport, database, external services, jobs, tests, or other applications must vary without rewriting policy.
- Business logic is leaking into controllers, views, ORM models, SQL callbacks, framework hooks, or glue code.
- Automated regression tests should drive the application without browser/server/database startup.
- The same capability should be usable through human UI, batch script, test harness, API, or program-to-program call.
- The app must keep working in headless or degraded modes, for example with an in-memory adapter while a database is unavailable.
- Interfaces are currently named by technology, but the architecture needs them named by purpose.

## Keep it light / when not to use

Prefer a smaller pattern when there is no meaningful outside variation. A plain function, local module boundary, Functional Core/Shell split, or framework convention may be enough when the code has one delivery mechanism, one storage technology, fast tests, and no policy/detail leakage.

Anti-signals:

- Every dependency gets an interface, but no adapter can be replaced, tested, or named by application purpose.
- The only goal is mocking; there is no protocol, persistence, UI, batch, degraded-mode, or test-harness pressure.
- Port names mirror vendors or frameworks, so the outside still defines the inside.
- A small CRUD slice gains ports, adapters, mappers, and composition code with no protected policy.

## Source-layout rule

The owning application/context defines the port in its own language. Adapters live at the edge and translate inward or outward.

Good source shape:

- `application/use-cases` or owning context: use-case policy and ports named by purpose.
- `adapters/http`, `adapters/cli`, `adapters/test`, `adapters/sql`, `adapters/in-memory`, etc.: technology mappings.
- Tests may use an adapter at a primary port to drive behavior, and an in-memory or mock adapter at a secondary port to isolate external dependencies.

Application sketch:

- Inbound port `SubmitOrder` accepts `SubmitOrderCommand` from HTTP, CLI, or a test adapter.
- Use case calls outbound port `InventoryReservation` and `PaymentAuthorization` in application terms.
- `adapters/http/submit_order_controller.ts` maps web request to command; `adapters/sql/inventory_reservation.ts` and `adapters/stripe/payment_authorization.ts` translate outward.
- Core tests drive `SubmitOrder` with in-memory outbound adapters; deleting Stripe affects composition and that adapter, not order policy.

Bad source shape:

- ports named after current technologies (`SqlOrderPort`, `HttpUserPort`) when the application conversation is really `Orders`, `Users`, or `RateRepository`.
- business rules in adapters, because “the controller already has the data.”
- one global `ports/` or `adapters/` dumping ground detached from the owning bounded context.
- adapter code importing inward objects and then reaching around the port into internals.

## Dependency rules

- Application policy must not depend on UI frameworks, HTTP request objects, ORM records, SQL clients, queue SDKs, mailer SDKs, or concrete external service clients.
- Primary adapters convert outside input into the port’s request/message shape, then call inward.
- Secondary adapters implement outward conversations required by the application and translate application requests into technology calls.
- Use cases should be specified against the inner boundary, not against GUI fields, URL shapes, table structures, or vendor payloads.
- Tests should cross the same port as real callers when the port is the reviewable boundary.

Binding checks:

- `must_not_import`: owning application/core modules must not import adapter modules or technology SDKs.
- `must_not_name`: port names must not encode a replaceable technology unless the technology is the domain.
- `negative_check`: delete or disable one adapter; application policy and other adapters should still compile/test except at composition.

## Port sizing

Do not create one port per use case by default, and do not collapse the whole app into only “input” and “output.” Choose the smallest set of purposeful conversations that reviewers can name and test.

Useful pressure tests:

- If two outside technologies perform the same purpose, they are likely adapters for one port.
- If two conversations have different application purposes, forcing them through one port hides meaning.
- If a port has only one adapter and no replacement, test, batch, degraded-mode, or protocol pressure, the seam is hypothetical.
- Two real adapters make the seam real; one adapter requires explicit justification.

## Review checklist

- Which side is inside, and which outside technologies are details?
- Are primary/driving adapters separate from secondary/driven adapters?
- Does each port name the purpose of a conversation, not a protocol or vendor?
- Can automated tests drive the application through a primary port without UI/server startup?
- Can secondary dependencies be replaced by in-memory/mock/test adapters without changing policy?
- Are use cases written at the application boundary rather than in GUI/database language?
- Are there binding import checks that keep adapters out of core policy?
- Did the architecture avoid a central adapter zoo by collocating adapters with the owning context?

## Failure modes

- Layered diagram theater: the drawing shows boundaries, but there is no import/test check to detect logic leaking into UI or persistence code.
- Mock-only seam: an interface exists only to mock a dependency, with no real translation, no alternate adapter, and no ownership rule.
- Adapter-owned domain language: the adapter’s protocol names become canonical domain terms.
- Technology-first ports: every vendor gets its own port even when several vendors serve one application purpose.
- Headless mode impossible: application behavior cannot run without UI/database/framework startup, so regression tests are slow and brittle.
- Application switchboard: the app becomes routing glue that buffers and forwards outputs instead of expressing a meaningful conversation.

## Proof-map implications

For every affected port/adapter seam, Architect should record the selective evidence needed for this pattern, not boilerplate for every incidental interface:

- concept: purpose-named port or adapter
- classification: inbound port, outbound port, primary adapter, secondary adapter, or temporary compatibility wrapper
- owner context/module and allowed paths
- forbidden paths/layers, especially core-to-adapter imports
- runtime entrypoint and composition point
- invariant: application policy remains ignorant of external technology shape
- compatibility decision for old imports or wrappers
- negative checks proving adapter deletion/replacement boundaries

## Complete semantic transfer from source material

These notes preserve the source intent in repo-local wording so reviewers do not need to open the original Hexagonal Architecture article to understand the pattern.

### Original problem pressure

The pattern starts from two recurring failures that look different but have the same cause.

On the user side, business logic leaks into UI, controller, or presentation code. That makes automated regression hard because the behavior under test depends on visual details, web request machinery, field names, buttons, browser/server startup, or framework lifecycle. It also prevents the same application behavior from being driven by a batch script, another program, or a test harness before the final UI exists.

On the data/resource side, application behavior becomes tied to a live database or external service. When that resource is unavailable, being redesigned, or replaced, developers cannot work and tests cannot run. The application is no longer independently executable.

A common failed response is to add another layer and promise that logic will not leak into it. That promise is weak unless there is a detectable boundary: import checks, test shape, port contracts, and code ownership that reveal the leak when it happens.

### Inside/outside, not top/bottom

The useful asymmetry is not UI above database, or left side versus right side. The useful asymmetry is inside versus outside:

- inside is the application behavior and semantic conversations it supports;
- outside is every device, framework, protocol, datastore, person, test harness, batch job, or neighboring application that talks to it.

The hexagon is a drawing convenience, not a six-sided rule. It prevents the one-dimensional stacked-layer mental model and leaves room for several ports. Most real applications have a small number of natural ports, often two to four, but the exact count is a judgment call. Both extremes are suspicious: one port per use case creates noise, while one generic input and one generic output side can erase meaning.

### Port meaning

A port is defined by the purpose of a conversation, not by the technology currently attached. The API/protocol of the port should express the application function at the inner boundary. If the port name or request type says `Http`, `Sql`, `Stripe`, `Kafka`, or `Django` when that technology is replaceable, the outside has named the inside.

The same port can have several adapters. A human UI, HTTP endpoint, command-line command, batch driver, test fixture, and programmatic API may all drive the same application capability. A SQL database, flat-file store, in-memory store, mock oracle, or remote service may all answer the same application-side request when they serve the same purpose.

### Adapter meaning

An adapter converts between the port's application-level conversation and the outside technology's signals. For a driving side, the adapter turns user actions, test rows, HTTP requests, messages, or batch records into a port call. For a driven side, the adapter turns application requests into database calls, network calls, file writes, notifications, or vendor SDK calls, then maps the answer back.

Adapters are allowed to know both worlds enough to translate. The application inside should not know the outside technology. The outside should not force its vocabulary, object lifecycle, error model, or schema shape into policy code.

### Primary and secondary sides

Architectural discussions can initially treat all outside actors symmetrically, but implementation benefits from distinguishing two flavors:

- **Primary / driving actors** wake the application up and ask it to perform one of its advertised functions. Examples: human UI, automated regression suite, batch script, HTTP caller, another program.
- **Secondary / driven actors** are called by the application to answer questions, persist data, notify someone, or record an outcome. Examples: database, mailer, payment service, file store, queue, downstream API.

The distinction is about who initiates the conversation. Tests commonly substitute a scripted driver for a primary actor and a mock/in-memory implementation for a secondary actor. This is a consequence of the architecture, not a shortcut around thinking about the application boundary.

### Use cases and functional specification

Use cases should be written at the application boundary. They should specify functions/events the application supports and the semantic data needed, not GUI field layout, URL routing, table structure, vendor payloads, or current framework behavior. Boundary-level use cases are shorter, more stable, and cheaper to maintain because they survive changes in outside devices.

### Development sequence consequence

A healthy ports/adapters implementation supports this sequence:

1. drive the application with an automated test harness while secondary resources are in-memory or mocked;
2. add a UI or delivery adapter while still using replaceable secondary adapters;
3. run integration tests through the same application boundary against real test resources;
4. run production adapters against production resources.

This means the application can be demoed, regression-tested, and integrated incrementally. It also means business-facing examples can be written before UI details are finalized.

### Headless and isolated execution

The strongest proof of the pattern is that the application can run without UI and without production databases. It can expose only an API/function boundary, accept a test/batch/program driver, and use mock or in-memory driven adapters. This enables standalone regression, development during external outages, application-to-application linking, and decomposition of larger suites into independently executable applications.

### Purpose over technology examples

A weather notification system may have ports for incoming weather feed, administration, subscriber notification, and subscriber data. New technologies such as HTTP feed or email notification should be new adapters for the same purposes, not new policy branches.

A discount calculator may have a driving port for discount requests and a driven port for rate lookup. Tests, GUI, and batch are possible driving adapters; constant, in-memory, SQL, or remote repositories are possible driven adapters.

A stored-output workflow can avoid turning the application into a switchboard. If presentation and storage are both output concerns for a specific interaction, a presentation adapter with storage capability may own buffering and save choice, rather than forcing the application to route its own output through multiple outside channels.

### Practical consequences for repo docs

When this pattern is chosen, docs must preserve:

- which conversations are ports and why they are purposeful;
- which adapters exist or are expected;
- which outside technologies are replaceable details;
- which use cases/specs are written at the inner boundary;
- how tests drive primary ports and substitute secondary ports;
- which imports or data shapes would prove outside leakage;
- whether the app can run headless and with in-memory/mock resources.

## Sources

1. Alistair Cockburn, “Hexagonal architecture the original 2005 article” — https://alistair.cockburn.us/hexagonal-architecture
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, `skills/create-architecture/references/language.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/ports-and-adapters.md`

Only list this file if it was actually loaded.
