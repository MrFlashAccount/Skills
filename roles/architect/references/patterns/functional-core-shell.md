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

## Sources

1. Gary Bernhardt, “Boundaries” — https://www.destroyallsoftware.com/talks/boundaries
2. RubyEvents transcript/summary of Gary Bernhardt, “Boundaries” — https://www.rubyevents.org/talks/boundaries
3. Sean Hammond, “Functional Core, Imperative Shell” — https://www.seanh.cc/2014/07/27/functional-core-imperative-shell/
4. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/functional-core-shell.md`

Only list this file if it was actually loaded.
