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

Application sketch:

- Controller maps `POST /loans` into `AssessLoanApplicationInput` and calls the use case.
- Use case applies policy, requests credit data through a port, and returns `AssessLoanApplicationOutput(decision, reasons, next_steps)`.
- Presenter maps output to HTTP/HTML/CLI response; persistence adapter maps repositories to the database.
- Inner policy imports none of the web framework, ORM, queue, or vendor SDK types.

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

For every policy/detail boundary, Architect should record the selective evidence needed for this pattern, not rote layer paperwork for trivial pass-through code:

- concept and classification: policy, use case, boundary record, adapter, framework detail, persistence detail
- owner module and allowed paths
- forbidden imports/types crossing inward
- runtime entrypoint and composition point
- invariant: detail decisions do not define policy names or behavior
- schema/durable field owner when records cross persistence or API boundaries
- negative checks for core tests without details and import-rule enforcement

## Repo-local synthesis and application notes

These notes make the pattern usable locally; source links are attribution and further reading, not prerequisites.

### Shared idea across named architectures

Clean Architecture combines the recurring properties of several architecture families: independence from frameworks, testability without external machinery, independence from UI, independence from database, and independence from outside agencies. The names and diagrams vary, but the common architecture aim is stable business/application policy separated from volatile delivery and infrastructure details.

The diagram is not the rule. The dependency rule is the rule.

### Dependency rule in full

Source-code dependencies must point inward toward higher-level policy. Inner code must not mention names declared in outer rings. That includes classes, functions, variables, data formats, annotations, framework base classes, ORM models, SQL result records, HTTP request objects, vendor SDK types, or any other detail whose name would make the inner policy aware of the outer mechanism.

Outer code may depend inward. Inner code may call outward only through abstractions that belong to the inner side. Runtime control flow may cross outward and inward, but source dependencies still point inward by using inversion: an inner use case calls an interface/port it owns, and an outer adapter implements it.

### Ring semantics

The number of rings is not fixed. The usual semantic progression is:

- enterprise/domain rules: the most general and stable business rules;
- application rules/use cases: application-specific orchestration of domain rules;
- interface adapters: translation between use-case-friendly data and external formats;
- frameworks/devices/details: web, UI, DB, filesystem, SDKs, frameworks, and tools.

A smaller repo may collapse some rings, but it must not reverse the dependency direction when policy/detail pressure is real.

### Entities / domain rules

Entity-level policy is the part least likely to change because of application delivery choices. It contains business concepts and rules that would still matter if the UI, database, or framework changed. It should not require the app server, ORM, or transport framework to express its behavior.

### Use cases / application rules

Use cases contain application-specific business rules. They orchestrate the flow of data to and from entities/domain behavior and direct which ports are needed. A use case describes what the application does for one action, not how the web framework receives the request or how a database stores rows.

Use cases are allowed to change when application behavior changes. They should not change merely because a database, UI, HTTP library, or framework is replaced.

### Interface adapters

Adapters convert between the data format most convenient for use cases/entities and the data format required by outside agencies. Controllers adapt incoming delivery mechanisms to use-case input. Presenters adapt use-case output to display/API output. Gateways/repositories adapt use-case requests to persistence or external services.

Adapters are also where database records are converted into application/domain structures. A database row shape is not automatically a domain model. An ORM object may be convenient in adapter code but becomes a dependency violation when inner policy requires it.

### Frameworks and drivers

Frameworks, databases, web servers, UI toolkits, messaging systems, and devices sit at the outer edge. They are important operational choices but should be treated as details relative to application policy. The architecture should allow these choices to be deferred or changed where there is real volatility pressure.

This does not mean frameworks are bad. It means framework coupling must not capture the policy that should survive framework replacement.

### Boundary crossing data

Data crossing inward should be simple and policy-friendly. It should not contain framework objects, database records, UI widgets, request contexts, response builders, or SDK payloads. Boundary records are often plain DTOs/commands/results. They can be boring, but they earn their existence only when they prevent detail leakage or stabilize a use-case contract.

Do not pass a row or request object inward and call it a DTO. The source of truth for boundary data is the use case's needs, not the current external representation.

### Main/composition consequence

Wiring belongs outside. The composition root, framework entrypoint, dependency injection module, or application bootstrap creates concrete adapters and gives them to use cases. This outer main component is allowed to know everyone because it is a detail that assembles the system; it should not own policy.

### Testability consequence

Core policy and use cases should be testable without web server, UI, database, external services, container startup, or framework lifecycle. Integration tests still matter, but they should not be the only way to verify business behavior. If every meaningful test needs the outer details, the dependency rule is not delivering its main value.

### Deferring decisions without stopping delivery

The pattern helps defer decisions about UI, database, framework, and external agencies, but it does not require horizontal layer-first delivery. A team can still deliver vertical product slices. Each slice crosses from delivery to policy to adapter, while keeping source dependencies pointed inward.

### Practical consequences for repo docs

When this pattern is chosen, docs must preserve:

- which policy is inner and why it should survive detail replacement;
- which use cases own application-specific rules;
- which outer mechanisms are details;
- which concrete type names/imports may not cross inward;
- where boundary data is defined and why;
- where composition/wiring happens;
- how tests prove policy without outer startup;
- where the repo intentionally accepts an active-record/framework-centric exception, if any.

## Sources

1. Robert C. Martin, “Clean Architecture” — https://blog.cleancoder.com/uncle-bob/2011/11/22/Clean-Architecture.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/clean-architecture.md`

Only list this file if it was actually loaded.
