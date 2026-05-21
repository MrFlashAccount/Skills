# Create-Architecture Workflow

Use this file when creating, improving, aligning, or auditing a project's architecture package.

This workflow is option-gated: architecture artifacts come only after an explicit architecture direction is chosen.
If the task is still vague, route discovery through grilling instead of guessing the target style. Do not treat ambiguous done/scope as a stable design basis.

## Stage map

1. `source-audit`
2. `grilling/context-recovery`
3. `option-narrowing`
4. `proposal-artifact`
5. `architect-review`
6. `critic-pressure`
7. `approval-gate`
8. `implementation`
9. `post-implementation architect+critic review`

Do not collapse stages 1-6 straight into artifact writing.

When Architect or Critic passes are delegated to workers/subagents, role label alone is not enough. The parent prompt must include the shared delegated role task template from [../../../shared/delegate/delegated-role-task-template.md](../../../shared/delegate/delegated-role-task-template.md), filled for the selected role and task, plus the selected role/phase overlay. Do not accept a required gate when required material cannot be loaded or final-answer requirements cannot be satisfied.

## 1. Source-audit

Start from concrete repo evidence.

Inspect:
- current code layout
- existing architecture docs, ADRs, and folder-level context docs
- runtime and deployment shape when relevant
- domain language already present in the repo
- known pain, goals, constraints, and planned change surface
- for `improve` work, current module/interface/seam shape, shallow-module clusters, adapter reality, local `CONTEXT.md` coverage, whether ownership artifacts are actually colocated, and whether source layout reveals the intended architecture

Default outputs:
- representative asks
- current shape summary
- missing architecture evidence
- constraint list
- likely architecture pressure points
- recommendation for `audit`, `scaffold`, or `improve`
- whether the request appears to need a design/architecture change or only a local change
- when in `improve`, whether the repo mainly needs alignment, selective deepening, seam cleanup, a broader architecture shift, or a dedicated evolution/refactor slice before feature work continues

Do not turn this into a canonical ADR or full architecture narrative.

## 2. Grilling / context recovery

Recover what the repo cannot tell you.

Focus on:
- business/domain pressure
- team ownership and decision rights
- scale, latency, reliability, and operational constraints
- integration boundaries
- testing pain
- deployment and release shape
- migration appetite and sequencing constraints

Ask one blocking question at a time.
If the answer already exists in the repo or nearby docs, recover it there first.

## 3. Option narrowing

Use the option catalog to move from all plausible shapes to 2-3 serious candidates.

For each candidate, state:
- why it fits this repo
- what pain it addresses
- what it would force the team to do differently
- what it would deliberately not solve
- what artifacts would be required if chosen

Reject obviously bad fits explicitly.
Do not leave the user with an unbounded menu.

## 4. Proposal artifact

Produce an approval-ready package before canonical docs exist.

Minimum contents:
- problem statement
- chosen mode and subtype
- shortlisted options with recommended choice
- tradeoffs and rejected alternatives
- target artifact map
- entity delta for architecture-level contexts/modules/seams/artifacts
- dependency/import-export map when source seams are affected, including binding `must_not_import` rules
- source-layout and doc deltas, including what does not change
- migration / PR slicing sketch with reviewable increments
- checks that can prove the structural rules hold
- open questions that materially affect the architecture decision

This proposal artifact may include lightweight sketches.
It must not pretend the decision is already made.

## 5. Architect review

Attack the proposal like a responsible principal architect.

Check:
- does the proposal solve the real problem or only redraw boxes?
- is the change surface concrete enough, or does Architect need to ask architecture-relevant clarifying questions?
- are seams, ownership, and dependency direction explicit?
- for existing-codebase improvement, do the proposed modules increase depth, leverage, and locality rather than adding pass-through indirection?
- is the option overfit to a fashion label?
- are the required artifacts justified and scoped?
- is the migration path credible?
- does the proposal state the target architecture, what changes, what does not change, the entity delta, affected relationships, import-export/dependency direction, source-layout/doc deltas, PR slicing, and checks clearly enough for implementation?

If the proposal fails, fix it before critic pressure.

## 6. Critic pressure

Try to break the proposal.

Pressure-test:
- hidden coupling
- fake modularity
- DDD theater
- missing runtime/deployment implications
- accidental framework lock-in
- excessive documentation burden
- under-specified context ownership
- target architecture hidden behind flat/global source modules
- shallow wrappers that fail the deletion test
- new seams with only hypothetical adapters
- PR slices that are too big or interdependent
- missing entity delta, import-export map, binding `must_not_import` rules, source-layout/doc deltas, or checks

If pressure reveals a real flaw, revise the proposal instead of rationalizing it.

## 7. Approval gate

Stop here and get explicit approval for the option and artifact package.

Approval must cover:
- selected architecture direction
- intended artifact set
- implementation scope

Without approval, stop after the proposal package.
Do not smuggle implementation through a polished proposal.

## 8. Implementation

After approval, create or revise the architecture package. The implementation-bound output must include the concrete structural change contract: target architecture, what changes, what does not change, entity delta for affected structural units, import-export/dependency map, owning source zones, boundaries, binding `must_not_import` rules, source-layout and doc deltas, PR slicing constraints, checks, and any required architecture-memory updates.

Required core deliverables:
1. Architecture Decision
2. C4: Context, Container, Component/Module
3. Strategic DDD when domain/ownership boundaries matter
4. Tactical DDD only where it clarifies real domain mechanics
5. Clean Architecture / Ports & Adapters view when relevant
6. `ARCHITECTURE.md` as the selected product architecture contract and entrypoint
7. local `CONTEXT.md` docs for important folders/contexts
8. migration / PR slicing plan

Implementation rules:
- keep `ARCHITECTURE.md` lean, navigable, and focused on the selected contract rather than generic architecture knowledge
- keep canonical decisions out of scattered ad-hoc notes
- treat collocation as a hard architecture principle: related entities, ports, adapters, and local rules stay with the owning context unless there is a strong contrary constraint
- treat folder-level `CONTEXT.md` docs as distributed source-of-truth contracts for local ownership and placement rules
- keep folder-level context local rather than centralized into one mega doc
- let central architecture docs index/discover local context rules instead of mirroring them
- prefer Mermaid for diagrams unless text is clearer
- do not freeze an imaginary future structure as if it already exists
- when chosen contexts, ports/adapters, or policy/detail layers are real, make the target source layout reveal them instead of routing new major responsibilities through flat/global modules
- tie every artifact to the chosen option, not to architecture buzzwords
- keep option catalogs, heuristics, best practices, and generic architectural judgment in the Architect role and create-architecture references; the produced `ARCHITECTURE.md` should capture the applied selected contract

## 9. Post-implementation architect + critic review

Review the implemented result against the approved proposal.

Check:
- did the package reflect the approved option faithfully, including target source-layout pressure?
- are C4, DDD, dependency rule, and context docs present where required?
- did any artifact regress into as-is documentation only?
- are ownership and forbidden dependencies explicit?
- are local rules and related ownership artifacts still properly colocated?
- is the migration path actually sliceable into PRs?
- did the package avoid the known failure modes?
- are architecture contracts, workflow states, artifact kinds, schemas, symbolic values, and source-layout contracts reflected consistently in docs and local `CONTEXT.md` records?
- do tests/checks exercise the same changed contract that source and docs describe?
- does any disagreement remain among source, tests/checks, and docs even if the code works locally?

Do not call the result done until both the architect lens and critic lens are clean enough.
