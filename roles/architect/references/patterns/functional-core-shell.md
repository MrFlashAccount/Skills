# Functional Core, Imperative Shell

Use Functional Core, Imperative Shell when the best architecture is a small deterministic core wrapped by side-effecting orchestration.

This is lower-weight than ports/adapters or Clean Architecture. It is useful when the slice has real decisions, transformations, or branching logic, but the side effects are mostly coordination with time, state, I/O, framework calls, or external systems.

## Core shape

- **Functional core**: deterministic functions/components that take values in and return values out. They hold decisions, transformations, rules, and most execution paths.
- **Imperative shell**: orchestration that owns side effects, persistent state, framework calls, network, disk, database, randomness, clock, logging, UI, and external libraries.
- **Value boundary**: simple data crossing between shell and core. Values reduce boundary-call risks because they do not require stubbing a collaborator’s behavior. Commands/results should name domain decisions, not transport or storage shapes.
- **Test split**: many fast tests against the core; fewer integration checks for the shell’s wiring and external calls.

## Use it when

- The slice is rules-heavy but integration-light: validation, classification, routing decisions, planning, transformations, pricing, eligibility, selection, formatting, merge/sort/filter decisions.
- Tests are slow or brittle because every branch currently requires I/O, mocks, framework startup, or database fixtures.
- A function/class has many logical paths but only needs a few inputs to decide.
- The shell has many dependencies but should have few branches.
- Values can serve as messages between classes, modules, actors, jobs, or processes.
- The team needs a small architecture move, not full DDD, Clean Architecture, or a plugin system.

## Anti-signals

- The work is mostly framework glue with little decision logic to extract.
- Purity would require awkward contortions that hide, rather than isolate, side effects.
- The “core” immediately calls back into time, random, database, logging, SDKs, or global state.
- The shell becomes a giant god-orchestrator around one giant core.
- Values are shaped by database rows or HTTP payloads instead of the core’s decision language.

## Dependency rules

- Core receives all needed facts explicitly as values; it does not reach out for hidden dependencies.
- Core does not perform I/O, mutate external state, call framework APIs, allocate nondeterministic values, read clocks, log, persist, publish, or call network clients. Side-effecting capabilities belong in the shell. Only pure deterministic functions may be passed into core code, and only when they are part of the decision algorithm rather than a disguised adapter.
- Shell may call dependencies and mutate state, but should keep branching small and delegate decisions to the core.
- Shell translates external objects into core values and core results into external effects.
- In larger systems, prefer many small functional cores with local shells over one global shell/core split.

Binding checks:

- `must_not_import`: core modules must not import shell modules, framework packages, SDKs, persistence clients, logging, clock/random providers, or process environment readers.
- `must_accept`: core entrypoints accept explicit values or records, not framework/database objects.
- `negative_check`: core tests run as plain unit tests with no mocks for external systems.

## Source-layout rule

Keep the split local to the owning context unless the repo already has a stronger architecture.

Good source shape:

- `decision.py`, `policy.ts`, `rules/`, `core/`, or context-local pure modules for deterministic logic.
- `handler`, `job`, `controller`, `command`, `shell/`, or adapter modules for I/O and orchestration.
- tests named around core decisions, plus a small number of shell integration/wiring tests.

Application sketch:

- Shell reads `HttpRequest`, authenticated user, current time, and repository rows, then builds `QuoteRequest(customer_tier, items, requested_at)`.
- Core returns `QuoteDecision(total, discounts, required_approval, reasons)` with no logging, persistence, or mail.
- Shell persists the quote, emits metrics, and sends approval mail based on the returned value.
- Good command/result/value names: `PlanRenewalCommand(account_id, plan_code, requested_at)`, `RenewalDecision(accepted, invoice_lines, warnings)`, `Money(amount, currency)`.
- Bad boundary values: `HttpRequest`, `OrderRow`, `DbSession`, `Mailer`, `Logger`, `dict` copied from JSON with no validated meaning, or `Command(do_anything=True)`.

Bad source shape:

- repo-wide `functional_core/` and `imperative_shell/` folders detached from feature ownership.
- shell functions with hidden business branches because “they already have the dependencies.”
- core functions that return commands so vague that nobody can tell what effect the shell must perform.
- mutation hidden inside “pure” helpers through globals, caches, singletons, or implicit context.

## Review checklist

- Which logic paths belong in the deterministic core?
- Which side effects remain in the shell?
- Are values the boundary, or are mocks still standing in for behavior across the core boundary?
- Does the core have many paths but few/no dependencies?
- Does the shell have dependencies but few paths?
- Are clocks, randomness, environment, database, network, filesystem, framework calls, and logging outside the core?
- Is the split local and useful, or fake architecture around one tiny function?
- Can the core be moved into another process/job/actor later because it communicates through values?

## Failure modes

- Hidden imperative core: the “pure” module reads globals, logs, calls time/random, or mutates cached objects.
- Branchy shell: orchestration accumulates decisions, so tests still need mocks and integration setup for every path.
- Value anemia: values are unvalidated bags with no stable meaning, so the core merely reshuffles data.
- Giant split: one global shell and one global core create coordination mess; compose many local splits instead.
- Actor/concurrency fantasy: value boundaries can help concurrency, but they do not justify introducing actors or processes without runtime pressure.
- Perfection trap: forcing 99% purity can cost more than moving the important 80% of logic out of the shell.

## Proof-map implications

For every core/shell split, Architect should record the selective evidence needed for this pattern, not boilerplate for every tiny helper:

- concept and classification: pure core, value boundary, imperative shell, external dependency
- owner context/module and allowed paths
- forbidden imports and nondeterministic calls inside core
- runtime entrypoint in the shell
- invariant: core decisions are deterministic for equal inputs
- test gate: core unit tests need no external mocks; shell checks cover wiring/effects
- deletion proof: if the core module is deleted, decision complexity reappears in shell callers

## Complete semantic transfer from source material

These notes preserve the source intent in repo-local wording so reviewers do not need to open the Functional Core / Imperative Shell source material to understand the pattern.

### The two kinds of code

The technique classifies code by behavior, not by folder name.

Functional-core code takes explicit values as input and returns values as output. It avoids implicit dependencies and keeps side effects out. Because it contains the decisions and branches, it may have many possible logical paths, but those paths are easy to test because the inputs are explicit and the output is deterministic.

Imperative-shell code owns side effects and persistent state. It talks to frameworks, databases, networks, disk, UI, sessions, clocks, random sources, logging, environment, and external libraries. It may be highly integrated with the rest of the system, but it should have few branches. Ideally it mostly gathers facts, calls the core, and performs effects from the result.

### Testability pressure

The pattern is justified when tests are hard because the code mixes decisions with framework and I/O dependencies. A naive handler may be readable but still expensive to test if the test must boot a web app, rebuild a database, patch framework globals, fake sessions, intercept network calls, and know internal names used by a framework.

The problem is not only slow tests. The deeper problem is that tests become coupled to incidental internals: global request/session objects, framework lifecycle, database setup, monkey patches, and import aliases. When those internals move, behavior tests break for the wrong reason.

### Dependency extraction

A practical refactor separates two dependency directions:

- incoming dependencies are things that call this code, such as framework controller methods or plugin hooks;
- outgoing dependencies are things this code calls, such as request params, config, HTTP clients, sessions, database APIs, redirects, clock, or logging.

Incoming dependency extraction often means moving logic out of a framework method into a standalone function or local module function that the framework method calls. Outgoing dependency extraction means passing facts or callable capabilities as parameters instead of reading globals or calling SDK/framework functions directly from the decision logic.

### Explicit parameters versus mocks

Passing dependencies explicitly can make parameter lists longer and can feel indirect. That cost is acceptable when it removes hidden dependencies and lets tests call the decision code directly with simple fakes or values. Prefer explicit values and small callable parameters over patching many framework names.

A callable parameter is safe in the core only when it is part of the decision algorithm or a deterministic supplied function. If it performs I/O, persistence, logging, time, random, or network work, it belongs in the shell or behind a heavier port/adapter boundary.

### Coverage shape

Most branch coverage should come from core tests. The shell may be so thin that it only needs a small number of integration/wiring checks. Leaving a trivial shell wrapper untested can be a conscious tradeoff when all meaningful behavior is covered in the core; alternatively, add one happy-path integration test for the wrapper and keep edge cases in core tests.

### Values as boundaries

The boundary should carry meaningful values, commands, or results. A core function receiving `QuoteRequest(customer_tier, items, requested_at)` is different from receiving an HTTP request or raw database row. Values should name the decision domain and be validated enough that the core is not just shuffling JSON dictionaries.

Value boundaries also reduce the need to mock collaborators. Instead of asking a mock object how it behaves, the test supplies the facts the core needs and checks the returned decision.

### Limits of the pattern

This is a small architecture move. It does not automatically define domain ownership, cross-context translation, plugin compatibility, or dependency inversion for many interchangeable technologies. If the pressure is external replaceability, use ports/adapters. If the pressure is policy/detail dependency direction across a larger app, use Clean Architecture. If the pressure is domain language and ownership, use DDD.

The pattern is also not a purity contest. Forcing every small helper to be pure or contorting code to achieve near-total purity can cost more than isolating the important decision paths. The useful target is that complex branching is deterministic and side-effect-free, while integration is thin and obvious.

### Practical consequences for repo docs

When this pattern is chosen, docs must preserve:

- which logic paths moved into deterministic core code;
- which side effects remain in shell code;
- what values cross the boundary and what they mean;
- what hidden dependencies were made explicit;
- which tests prove core branches without framework/I/O setup;
- which shell integration checks remain;
- what impurity or shell branching is intentionally tolerated and why.

## Sources

1. Gary Bernhardt, “Boundaries” — https://www.destroyallsoftware.com/talks/boundaries
2. RubyEvents transcript/summary of Gary Bernhardt, “Boundaries” — https://www.rubyevents.org/talks/boundaries
3. Sean Hammond, “Functional Core, Imperative Shell” — https://www.seanh.cc/2014/07/27/functional-core-imperative-shell/
4. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/functional-core-shell.md`

Only list this file if it was actually loaded.
