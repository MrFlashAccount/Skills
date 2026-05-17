# ADR

An ADR is a small durable record of one architecturally significant decision: context, decision, status, and consequences.

Prefer one decision per file. When the decision changes, supersede the old record instead of rewriting history.

## Use it when

- the choice affects structure, dependency direction, interfaces, or architecture records
- future reviewers would otherwise have to reverse-engineer why the shape is the way it is

## Anti-signals

- giant design docs pretending to be ADRs
- packing unrelated decisions into one record

## Sources

1. Michael Nygard, "Documenting Architecture Decisions" — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
2. Repo canon: `roles/architect/ROLE.md`
