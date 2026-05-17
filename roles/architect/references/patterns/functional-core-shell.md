# Functional Core, Imperative Shell

Use this pattern when the core decisions can be expressed as pure value-in/value-out logic and the side effects can stay at the edge.

The shell owns I/O, time, randomness, framework calls, and orchestration. The core owns rules, transformations, and decisions.

## Use it when

- testability depends on isolating side effects
- a small rules-heavy slice does not need heavier architectural machinery
- a job, workflow step, or domain policy can be expressed as deterministic logic

## Anti-signals

- forcing purity through framework glue that is mostly coordination
- pretending the shell disappeared when side effects were only hidden

## Sources

1. Gary Bernhardt, "Boundaries" — https://www.destroyallsoftware.com/talks/boundaries
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
