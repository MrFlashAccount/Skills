# Ports and Adapters

Use Ports and Adapters when the architecture problem is an inside/outside boundary: application policy must be driven by different outside actors, or must call outside resources, without letting those outside technologies define the application model.

Also called Hexagonal Architecture. The hexagon is only a drawing device: it reminds reviewers that an application may have more than a top UI and bottom database, and that every outside technology attaches through a purpose-named boundary.

## Core shape

- **Inside**: application behavior, use cases, business rules, and semantically meaningful operations.
- **Port**: a purposeful conversation at the application boundary, described in application terms.
- **Adapter**: technology-specific translation between a port and an outside actor, framework, protocol, database, test harness, batch job, or another application.
- **Primary / driving side**: actors that trigger application behavior: UI, HTTP, CLI, scheduler, test script, batch driver, another program.
- **Secondary / driven side**: things the application calls to answer, persist, notify, publish, or retrieve: database, mailer, queue, payment API, filesystem, model provider.

A port is not “an interface because interfaces are good.” It is the contract for a conversation the application can have while staying ignorant of the device or protocol on the other side.

## Use it when

- UI, transport, database, external services, jobs, tests, or other applications must vary without rewriting policy.
- Business logic is leaking into controllers, views, ORM models, SQL callbacks, framework hooks, or glue code.
- Automated regression tests should drive the application without browser/server/database startup.
- The same capability should be usable through human UI, batch script, test harness, API, or program-to-program call.
- The app must keep working in headless or degraded modes, for example with an in-memory adapter while a database is unavailable.
- Interfaces are currently named by technology, but the architecture needs them named by purpose.

## Source-layout rule

The owning application/context defines the port in its own language. Adapters live at the edge and translate inward or outward.

Good source shape:

- `application/use-cases` or owning context: use-case policy and ports named by purpose.
- `adapters/http`, `adapters/cli`, `adapters/fit`, `adapters/sql`, `adapters/in-memory`, etc.: technology mappings.
- Tests may use an adapter at a primary port to drive behavior, and an in-memory or mock adapter at a secondary port to isolate external dependencies.

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

For every affected port/adaptor seam, Architect should record:

- concept: purpose-named port or adapter
- classification: inbound port, outbound port, primary adapter, secondary adapter, or temporary compatibility wrapper
- owner context/module and allowed paths
- forbidden paths/layers, especially core-to-adapter imports
- runtime entrypoint and composition point
- invariant: application policy remains ignorant of external technology shape
- compatibility decision for old imports or wrappers
- negative checks proving adapter deletion/replacement boundaries

## Sources

1. Alistair Cockburn, “Hexagonal architecture the original 2005 article” — https://alistair.cockburn.us/hexagonal-architecture
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`, `skills/create-architecture/references/language.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/ports-and-adapters.md`

Only list this file if it was actually loaded.
