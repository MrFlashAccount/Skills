# Clean Architecture

Use Clean Architecture when the main architectural risk is policy/detail coupling: business rules or use cases are being shaped by frameworks, UI, persistence, transport, or vendor APIs.

The practical point is not circles, ceremony, or a fixed number of layers. The point is a dependency rule: source-code dependencies point toward stable policy, while volatile details sit outside and translate.

## Core shape

- **Policy**: enterprise/domain rules and application use cases that should survive UI, framework, database, and delivery changes.
- **Interactor / use case**: application-specific orchestration of policy; accepts simple input data and returns simple output data.
- **Interface adapters**: controllers, presenters, gateways, mappers, repositories, and equivalent translators between external shapes and use-case shapes.
- **Details**: UI, web framework, database, ORM, message bus, filesystem, devices, vendor SDKs, and deployment framework.
- **Boundary data**: plain request/response models, DTOs, records, or messages that cross between policy and detail without smuggling framework objects inward.

## Use it when

- Controllers, views, ActiveRecord/ORM models, framework callbacks, or database records contain business rules.
- Tests for core behavior require starting a web server, container, Rails/Django/Spring app, database, queue, or UI.
- A team needs to defer or replace UI, database, framework, transport, or vendor choices without rewriting use cases.
- “Convention over configuration” is being used as an excuse for coupling policy to framework objects.
- Long skinny product slices are required, but each slice can still keep use cases decoupled from detail choices.

## Keep it lighter when

- The slice is tiny, single-owner, and no concrete bad dependency arrow is at risk.
- A pass-through layer would only rename functions and increase navigation cost.
- Framework types are the actual domain contract, not incidental delivery detail.

## Dependency rules

- Inner policy must not import outer detail.
- Controllers unpack framework requests into simple input data; they do not know business rules.
- Interactors/use cases implement the application action by invoking domain/business objects and ports.
- Presenters/views receive simple output data; they do not know business objects.
- ORM/database records are persistence details unless the repo has explicitly chosen active-record domain modeling.
- Framework conventions are acceptable only while they do not force policy to depend on framework types.

Binding checks:

- `must_not_import`: policy/use-case modules must not import web, UI, ORM, SQL, queue, vendor SDK, filesystem, or framework packages.
- `must_not_accept`: use cases must not accept `HttpRequest`, controller context, ORM row, framework model, or vendor payload as core input.
- `negative_check`: core tests run without server/container/database/framework startup.

## Source-layout rule

The source tree should make the policy/detail split visible enough for review.

Good source shape:

- `domain/` or owning context: rules and domain structures.
- `application/` or `use_cases/`: interactors, commands, queries, ports, input/output models.
- `adapters/` or delivery-specific folders: HTTP, CLI, presenters, persistence, queue, vendor gateways.
- `composition/` or framework entrypoint: wiring of details to ports.

Bad source shape:

- `models/` that mixes ORM persistence, validation, use-case decisions, and domain rules without an explicit exception.
- `services/` as an ownerless dump for business logic extracted from controllers.
- boundary DTOs that are just renamed framework or database records.
- “clean” layers where every class forwards to the next class with no owned policy.

## Review checklist

- What policy must survive UI/framework/database replacement?
- Which concrete dependency arrows are forbidden?
- Do use cases accept and return simple data, or framework/persistence objects?
- Can core behavior be tested without outer details running?
- Is any field-copying boundary earning decoupling, or is it rote duplication with no volatility pressure?
- Are long skinny slices still end-to-end while remaining decoupled?
- Does source layout reveal policy vs detail, or hide it behind generic `services` and `utils`?
- Did the design avoid Big-Up-Front theater while still choosing dependency direction deliberately?

## Failure modes

- Circle cosplay: layers exist, but details still leak inward through imports, types, annotations, base classes, or data models.
- Framework capture: the application is organized around Rails/Spring/Django/ORM conventions even where those conventions are not the domain.
- DTO flood: many copy-only objects appear without any protected volatility boundary.
- Use-case anemia: interactors become transaction scripts that bypass domain behavior and carry all invariants in procedural glue.
- Detail-driven tests: every meaningful test starts a server, database, or container, making fast policy feedback impossible.
- Deferral confusion: good architecture allows decisions to be deferred; it does not require teams to stop delivering whole vertical slices.

## Proof-map implications

For every policy/detail boundary, Architect should record:

- concept and classification: policy, use case, boundary record, adapter, framework detail, persistence detail
- owner module and allowed paths
- forbidden imports/types crossing inward
- runtime entrypoint and composition point
- invariant: detail decisions do not define policy names or behavior
- schema/durable field owner when records cross persistence or API boundaries
- negative checks for core tests without details and import-rule enforcement

## Sources

1. Robert C. Martin, “Clean Architecture” — https://blog.cleancoder.com/uncle-bob/2011/11/22/Clean-Architecture.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/clean-architecture.md`

Only list this file if it was actually loaded.
