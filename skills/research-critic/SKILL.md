---
name: research-critic
description: Produce a reusable pre-implementation research packet with proposal plus critique from a task description and available context. This is the `research` stage in the repo's four-stage flow. Use when the ask is to break down a task, write a proposal, challenge the plan, or prepare a structured research/critic output that closes research before execution planning. This skill is GitHub-agnostic and should trigger on asks like research this task, do proposal plus critic, or prepare a readiness packet.
---

# Research Critic

Use this as the generic pre-implementation reasoning stage.

In the repo's default flow, this is stage 1: `research`.

Own only:
- turning a task description and context into a structured research packet
- consuming available context/evidence first instead of re-asking already answered questions
- writing one proposal section and one critique section
- returning a final research-closure verdict with a separate unresolved/blocking section when needed

Do not own:
- GitHub issues, comments, project boards, or status transitions
- cron, polling, or orchestration
- implementation, PR review, merge, or execution ownership
- pretending missing context is resolved when it is not

## Read order

1. Read [references/input-contract.md](references/input-contract.md).
2. Read [`../../Roles/Critic/ROLE.md`](../../Roles/Critic/ROLE.md).
3. Read [`../../Roles/Critic/RUBRIC.md`](../../Roles/Critic/RUBRIC.md).
4. Read [references/output-contract.md](references/output-contract.md).
5. Read [references/workflow.md](references/workflow.md).
6. Read [references/verdicts.md](references/verdicts.md).
7. For validation or maintenance of this skill itself, read [references/testing.md](references/testing.md).

## Default workflow

1. Normalize the task into the input contract.
2. Build the research/proposal packet from the provided context/evidence first.
3. Run a separate critic pass against that packet using `Roles/Critic/ROLE.md` and `Roles/Critic/RUBRIC.md`, adapted for research-stage critique.
4. Return one structured output packet matching the output contract.
5. Stop there. Another layer may persist or route the result only after research is closed enough.

The next stage is `execution plan`, typically handled by `dev-harness` consuming this packet.

## Rules

- This skill is generic and GitHub-agnostic. It must not mention boards, issue comments, or status names unless they were part of the task context itself.
- Proposal and critic are both required; do not return proposal-only output.
- The proposal may name implementation direction, file zones, dependencies, and acceptance criteria, but it must not drift into actual implementation.
- The critic must attack assumptions, weak evidence, ambiguity, and hidden risks instead of politely paraphrasing the proposal.
- Treat `Roles/Critic/ROLE.md` as the canonical critic identity; this skill supplies the research-stage wrapper and output contract.
- Use available context/evidence first and keep answered questions closed unless a contradiction or missing evidence reopens them.
- If context is insufficient, say exactly what is missing and lower the research-closure verdict.
- If execution planning would still require broad rediscovery, the research is not closed; keep the verdict below ready-for-execution-planning.
- If any blocker or unresolved dependency remains, surface it in one dedicated top-level output field instead of scattering it across prose.
- Output should be structured enough that another skill can persist it without reinterpreting free-form prose.
