# Create-Architecture Language

Use these terms consistently.

## Core terms

- **Architecture package** — the routed set of canonical architecture artifacts, with `ARCHITECTURE.md` as entrypoint.
- **Proposal artifact** — the approval-ready pre-implementation package. Not canonical architecture output.
- **Option** — a serious architecture direction under consideration.
- **Context** — a domain or folder area with its own language, ownership, and rules.
- **Module** — anything with an interface and an implementation, from function-scale to folder-scale.
- **Interface** — everything a caller must know to use a module correctly: types, invariants, error modes, ordering, configuration, and performance-sensitive constraints.
- **Implementation** — the code hidden behind a module's interface.
- **Seam** — where interaction crosses between contexts, modules, or external dependencies; the location where an interface lives.
- **Adapter** — concrete implementation attached to a port or seam.
- **Depth** — leverage at the interface: how much behavior is concentrated behind what callers have to learn.
- **Leverage** — what callers gain from depth.
- **Locality** — what maintainers gain when change, bugs, and knowledge stay concentrated instead of smeared across callers.
- **Entity delta** — the architecture-level structural units added, changed, removed, or deliberately left unchanged by the slice.
- **Dependency rule** — the allowed direction of source-code dependencies.
- **Import-export map** — the structural map of what imports what, what exports what, and which context/module owns each exposed seam.
- **`must_not_import` rule** — a binding no-go source dependency that implementation and review must preserve.
- **Inbound port** — interface through which the system or a context is driven.
- **Outbound port** — interface through which the system or a context reaches outward.
- **Context doc** — local `CONTEXT.md` file governing an important folder or bounded context, colocated with what it governs. Uppercase `CONTEXT.md` is the canonical default for new files; `Context.md` is an alternate repo-existing spelling.
- **Source-layout delta** — the folder/package/source-zone movement or placement expectation required by the architecture decision.
- **Doc delta** — the architecture-memory artifact to create, update, remove, or explicitly leave unchanged.
- **PR slice** — the smallest reviewable implementation increment that advances the migration.
- **Architecture check** — the grep, import-lint, dependency graph, test, build, or reviewer check that proves a structural rule held.

## Language discipline

- Say **proposal artifact**, not "draft architecture" when the decision is not approved yet.
- Say **context** when talking about DDD or local folder governance; do not blur everything into "module".
- Say **module**, **interface**, **implementation**, **seam**, **adapter**, **depth**, **leverage**, and **locality** precisely when reviewing existing-codebase architecture improvements.
- Say **seam**, **import-export map**, or **dependency rule** instead of vague "boundary" talk when the distinction matters.
- Say **align** only for reconciliation work inside `improve`, not for hidden redesign.
- Say **architecture package**, not "big architecture doc".
- Treat collocation as a hard principle: related entities, ports, adapters, and local rules belong with the owning context unless there is a strong contrary constraint.
- Treat local `CONTEXT.md` docs as distributed context contracts, not as optional commentary once the package exists.
- Let central docs route and index; do not use them to mirror local ownership rules.
- Use **architecture check** for verifiable structural rules; do not turn checks into patch recipes or implementation task lists.

## Improvement heuristics

- **Deletion test** — if deleting a module makes complexity disappear, it was probably pass-through indirection; if complexity reappears across many callers, the module was earning its keep.
- **Interface is the test surface** — tests and callers should cross the same seam; if good tests require reaching past the interface, the shape is probably wrong.
- **One adapter = hypothetical seam; two adapters = real seam** — do not celebrate indirection that lacks meaningful variation.

## Anti-language

Avoid these failure phrases unless you immediately make them concrete:
- scalable
- robust
- clean
- enterprise-grade
- future-proof
- modular
- best practice

If you use them, tie them to an actual seam, artifact, constraint, or migration decision.
