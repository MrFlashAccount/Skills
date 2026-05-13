---
name: research-critic
description: "Produce a reusable pre-implementation research verdict from a task description and available context, using a Researcher -> Critic workflow. This is the `research` stage in the repo's four-stage flow. Use when the ask is to break down a task, prepare a research packet, challenge assumptions, or close research before downstream ownership: Architect for architecture-sensitive scope, otherwise execution planning. This skill is GitHub-agnostic and should trigger on asks like research this task, run researcher critic, or prepare a readiness packet."
---

# Research Critic

Use this as the generic pre-implementation reasoning stage.

In the repo's default flow, this is stage 1: `research`.

Own only:
- orchestrating the `research` stage workflow: Researcher -> Critic -> final research verdict
- having Researcher turn a task description and context into a structured research packet
- having Researcher ask targeted clarifying questions when the desired outcome is still fuzzy
- consuming available context/evidence first instead of re-asking already answered questions
- having Critic pressure-test that packet
- returning a final research-closure verdict with a separate unresolved/blocking section when needed

Do not own:
- GitHub issues, comments, project boards, or status transitions
- cron, polling, or external lifecycle orchestration
- implementation, PR review, merge, or execution ownership
- final change scope, canonical architectural change lists, or structural contracts
- pretending missing context is resolved when it is not

## Read order

1. Read [references/input-contract.md](references/input-contract.md).
2. Read [`../../roles/researcher/ROLE.md`](../../roles/researcher/ROLE.md).
3. Read [`../../roles/researcher/RUBRIC.md`](../../roles/researcher/RUBRIC.md).
4. Read [`../../roles/researcher/LEARNINGS.md`](../../roles/researcher/LEARNINGS.md).
5. Read [`../../roles/critic/ROLE.md`](../../roles/critic/ROLE.md).
6. Read [`../../roles/critic/RUBRIC.md`](../../roles/critic/RUBRIC.md).
7. Read [`../../roles/critic/LEARNINGS.md`](../../roles/critic/LEARNINGS.md).
8. Read [references/output-contract.md](references/output-contract.md).
9. Read [references/workflow.md](references/workflow.md).
10. Read [references/verdicts.md](references/verdicts.md).
11. For validation or maintenance of this skill itself, read [references/testing.md](references/testing.md).

## Default workflow

1. Normalize the task into the input contract.
2. Run Researcher using `roles/researcher/ROLE.md`, `roles/researcher/RUBRIC.md`, and `roles/researcher/LEARNINGS.md` to build the research/proposal packet from the provided context/evidence first; if the desired outcome is still fuzzy, Researcher must ask targeted clarifying questions instead of silently assuming the answer.
3. Run Critic using `roles/critic/ROLE.md`, `roles/critic/RUBRIC.md`, and `roles/critic/LEARNINGS.md` to pressure-test that packet for research-stage readiness.
4. Return one structured final research verdict matching the output contract.
5. Stop there. Another layer may persist or route the result only after research is closed enough.

For architecture-sensitive or structurally underspecified work, the next chain is `Researcher -> Critic -> Architect -> execution planning/implementation`: Architect consumes the challenged research packet and owns the final structural change contract before execution planning/implementation. For non-architecture-sensitive work, the next stage is `execution plan`, typically handled by `dev-harness` consuming this packet.

## Rules

- This skill is generic and GitHub-agnostic. It must not mention boards, issue comments, or status names unless they were part of the task context itself.
- Researcher and Critic are both required; do not return proposal-only or critic-only output.
- The proposal may name candidate implementation direction, file zones, dependencies, and acceptance criteria, but it must not drift into actual implementation, final scope ownership, or a canonical architectural change list.
- The critic must attack assumptions, weak evidence, ambiguity, and hidden risks instead of politely paraphrasing the proposal.
- Treat `roles/researcher/ROLE.md` as the canonical researcher identity and `roles/critic/ROLE.md` as the canonical critic identity; this skill supplies the research-stage wrapper and output contract.
- Use available context/evidence first and keep answered questions closed unless a contradiction or missing evidence reopens them.
- If context is insufficient, say exactly what is missing and lower the research-closure verdict.
- If execution planning would still require broad rediscovery, the research is not closed; keep the verdict below ready-for-execution-planning.
- If any blocker or unresolved dependency remains, surface it in one dedicated top-level output field instead of scattering it across prose.
- Output should be structured enough that another skill can persist it without reinterpreting free-form prose.
