---
name: create-architecture
description: Create, improve, align, or audit a project's architecture decision package. Use when the task is to choose an architecture direction, create or revise `ARCHITECTURE.md`, define C4/DDD/ports-and-adapters artifacts, improve an existing codebase's module/interface/seam shape, add colocated `CONTEXT.md` rules for important folders, or slice an architectural migration into reviewable PRs. This skill is for architecture shaping and architecture-memory work, not for dumping generic best practices or writing canonical architecture docs before option choice and approval.
---

Turn a vague architecture ask into an approval-gated architecture package with explicit options, review pressure, and implementation artifacts.

## Mode selection

Choose one mode up front:

1. `audit`
   - inspect the current architecture surface
   - identify friction, missing artifacts, broken seams, or drift
   - no silent implementation

2. `scaffold`
   - recover context, narrow options, and prepare the proposal artifact
   - may stop after the approval-ready package if implementation is not approved yet
   - use when the repo has no usable architecture package yet

3. `improve`
   - evolve an existing architecture package or architecture shape
   - includes `align` as the default subtype for MVP when the real need is to reconcile code, docs, and boundaries without a full redesign
   - may escalate beyond `align` only when the repo clearly needs structural change

If the context is still fuzzy, grill first.
If the answer can be recovered from the repo, docs, or code, inspect that instead of asking.
Ask one blocking question at a time.

## Mandatory workflow

Keep these stage boundaries intact:

1. source audit
2. grilling / context recovery
3. option narrowing
4. proposal artifact
5. architect review
6. critic pressure
7. approval gate
8. implementation
9. post-implementation architect + critic review

Hard rule: do not write canonical architecture artifacts before option choice and approval.
That includes ADRs, C4 diagrams, strategic/tactical DDD docs, ports-and-adapters contracts, `ARCHITECTURE.md`, and folder-level `CONTEXT.md` docs.

## Core rules

- This skill is not a prose generator. Work from the actual repo, constraints, and change surface.
- Reduce the task to 3-5 representative asks unless the scope is truly tiny.
- Keep `ARCHITECTURE.md` as the selected product architecture contract and routing layer, not the whole architecture stuffed into one mega-doc or a catalog of every possible approach.
- Prefer Mermaid for C4 when practical; use text C4 only when diagrams would be brittle or noisy.
- Strategic DDD is required when domain boundaries or ownership matter.
- Tactical DDD is selective. Do not spray entities, aggregates, and repositories everywhere just to sound architectural.
- Make the dependency rule explicit when using Clean Architecture or Ports & Adapters.
- Treat collocation as a hard architecture principle: related entities, ports, adapters, and local rules belong with the owning context unless there is a strong contrary constraint.
- Canonical default for new local context-contract files is uppercase `CONTEXT.md`. If a repo already uses `Context.md`, treat that as an existing alternate spelling rather than a reason to centralize or rename blindly.
- `CONTEXT.md` files must be local to important folders/contexts and must state ownership, placement rules, allowed modules, and forbidden dependencies.
- Central architecture docs should index and discover local context rules, not mirror them.
- `ARCHITECTURE.md` should capture the chosen option, chosen constraints, binding rules, entities/contexts/boundaries, dependency direction, and pointers to local `CONTEXT.md` files. Option catalogs, heuristics, best practices, and generic architecture judgment belong in the Architect role and create-architecture references, not in the product contract itself.
- Migration guidance must be sliceable into reviewable PRs. Do not leave migration as one giant future blob.
- After the first implementation pass, run architect review, critic pressure, fixes, and a final post-implementation review before calling it done.
- Watch the main failure modes explicitly: writing docs too early, dumping the as-is state without decisions, omitting C4, collapsing DDD into buzzwords, centralizing everything into one doc, centralizing local ownership rules that should stay colocated, and freezing a folder tree that the repo has not earned.

## Read next

- Read `references/workflow.md` for the full stage model and branch handling.
- Read `references/modes.md` for `audit`, `scaffold`, `improve`, and `align` expectations.
- Read `references/architecture-artifact-contract.md` before deciding what the architecture package must ship.
- Read `references/option-catalog.md` before narrowing options.
- Read `references/codebase-improvement.md` when `improve` work is really about deepening an existing codebase's module/interface/seam shape.
- Read `references/review-lens.md` before architect review, critic pressure, and the final gate.
- Read `references/state-machine.md` when the workflow risks leaking from diagnosis into premature artifact writing.
