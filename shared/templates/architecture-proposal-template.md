# <Project/Issue> Architecture Proposal — <Capability>

## Status

- Owner:
- Date:
- State: Draft | Ready for approval | Approved | Rejected
- Based on approved research packet:

## Architecture decision

<1-3 paragraphs: the target shape, why this shape, and the decision being requested.>

## Target entities

| Entity | Status | Placement | Responsibility |
| --- | --- | --- | --- |
| <entity> | New/Change/Keep/Retire | Core/Integration/Plugin/Dependency/<path or package> | <single responsibility> |

## Placement/ownership

- Core-owned:
- Integration-owned:
- Plugin/extension-owned:
- External dependency-owned:
- Explicitly not owned here:

## Dependency rules

### Allowed

- <Entity/package A> may depend on <B> for <reason>.

### Forbidden

- <Entity/package A> must not import/call <B> because <boundary>.

## Runtime relationships

<Concise flow of how the entities interact at runtime. Name callers/callees and ownership boundaries, not code.>

## Policy/behavior rules

- <Invariant, fallback, approval rule, safety rule, or lifecycle rule.>

## Interfaces/ports to define

| Interface/port | Responsibility only | Owned by | Used by |
| --- | --- | --- | --- |
| <name> | <what it abstracts or guarantees> | <owner> | <consumer> |

## Documentation updates

- <README/reference/process doc that must reflect the architecture decision.>

## Non-goals/forbidden moves

- <Architecture or ownership move explicitly out of scope.>
- <Shortcut that would violate placement/dependency rules.>

## Architecture checks before implementation proposal

- Research packet is approved and cited.
- Entity placement is explicit.
- Dependency direction is explicit and enforceable.
- Runtime relationships are named without drifting into code-level tasks.
- Documentation impact is identified.
- Forbidden moves are clear enough for reviewers to reject scope creep.

## Approval gate

Implementation planning may start only after this architecture proposal is reviewed and approved.

## Template rules

- Be concise, concrete, and opinionated.
- Say where entities belong: core, integration, plugin, dependency, or another explicit owner.
- State imports/dependencies that are allowed and forbidden.
- Do not include implementation tasks, code, diffs, command sequences, or workstream assignments.
