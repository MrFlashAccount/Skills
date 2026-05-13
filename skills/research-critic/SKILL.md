---
name: research-critic
description: "Produce a reusable pre-implementation research verdict from a task description and available context, using Researcher A -> Researcher B attack -> wrapper verdict. This is the `research` stage in the repo's flow. Use when the ask is to break down a task, prepare a research packet, challenge assumptions, or close research before downstream ownership: Architect for architecture-sensitive scope, otherwise execution planning. This skill is GitHub-agnostic and should trigger on asks like research this task, run researcher critic, or prepare a readiness packet."
---

# Research Critic

Use this as the generic pre-implementation research wrapper.

In the repo's default flow, this is stage 1: `research`.

Own only:

- orchestrating `Researcher A -> Researcher B attack -> wrapper verdict`
- having Researcher build the structured packet defined in `roles/researcher/*`
- having Researcher ask targeted clarifying questions when the desired outcome is fuzzy
- consuming available context/evidence first instead of re-asking already answered questions
- keeping the Researcher packet distinct from wrapper-level findings and verdict
- returning a final research-closure verdict with explicit blockers when needed

Do not own:

- GitHub issues, comments, project boards, or status transitions
- cron, polling, or external lifecycle orchestration
- implementation, PR review, merge, or execution ownership
- final structural/change contracts, structural entities, implementation entities, or implementation handoff
- pretending missing context is resolved when it is not

## Read order

1. Read [references/input-contract.md](references/input-contract.md).
2. Read [`../../roles/researcher/ROLE.md`](../../roles/researcher/ROLE.md).
3. Read [`../../roles/researcher/RUBRIC.md`](../../roles/researcher/RUBRIC.md).
4. Read [`../../roles/researcher/LEARNINGS.md`](../../roles/researcher/LEARNINGS.md) if present.
5. Read [references/output-contract.md](references/output-contract.md).
6. Read [references/workflow.md](references/workflow.md).
7. Read [references/verdicts.md](references/verdicts.md).
8. For validation or maintenance of this skill itself, read [references/testing.md](references/testing.md).

## Default workflow

1. Normalize the task into the input contract.
2. Run `Researcher A` using `roles/researcher/ROLE.md`, `roles/researcher/RUBRIC.md`, and role learnings to build the canonical Researcher packet from provided context/evidence first.
3. For non-trivial research, run `Researcher B attack` using the same role contract to challenge evidence, assumptions, unknowns, decisions needed, candidate approaches, blockers, and risks.
4. Allow one bounded revise/re-review loop when the attack finds fixable gaps, unless the caller explicitly approves another.
5. Return one structured wrapper verdict matching `references/output-contract.md`.
6. Stop there. For non-trivial work, another layer may persist or route the result only after the wrapper verdict and explicit user approval.

For architecture-sensitive or structurally underspecified work, the next chain is `user approval -> Architect A -> Architect B attack -> structural contract -> execution planning`. Architect consumes the challenged Researcher packet and owns structural entities and the final structural contract. For non-architecture-sensitive work, the next stage is execution planning after user approval, typically handled by `dev-harness` consuming this wrapper packet.

## Rules

- This skill is generic and GitHub-agnostic. It must not mention boards, issue comments, or status names unless they were part of the task context itself.
- The Researcher packet must stay distinct from wrapper-level fields such as critic findings, missing evidence, verdict, and readiness note.
- The canonical Researcher contract lives in `roles/researcher/ROLE.md` and `roles/researcher/RUBRIC.md`; do not duplicate it here beyond links and routing rules.
- Researcher output may name domain vocabulary, known facts/evidence, decisions needed, and candidate approaches, but not final structural contracts, structural entity maps, implementation entity maps, or implementation instructions.
- `Researcher B attack` is the same role class in adversarial mode, not a separate role identity.
- Use available context/evidence first and keep answered questions closed unless a contradiction or missing evidence reopens them.
- If context is insufficient, say exactly what is missing and lower the research-closure verdict.
- If execution planning would still require broad rediscovery, the packet is not ready to present for handoff approval; keep the verdict below ready-for-execution-planning.
- If any blocker or unresolved dependency remains, surface it in the wrapper-level `unresolved_blockers` field.
- Output should be structured enough that another skill can persist it without reinterpreting prose.
