# Workflow

This skill is the reusable `research` stage wrapper:

`Researcher A -> Researcher B attack -> wrapper verdict`

When architecture-sensitive scope remains, the downstream chain is:

`Researcher packet + wrapper verdict -> user approval -> Architect A -> Architect B attack -> structural contract -> execution planning`

It can sit underneath transport adapters such as tickets, cron, chat, or future TaskFlow adapters without owning those adapters.

## When to use it

Use when:

- the task needs structured research before implementation
- the research packet should be challenged before human or downstream review
- the caller needs an adapter-friendly readiness packet
- the surrounding transport layer should stay thin

Do not use when:

- the ask is to create or update GitHub artifacts directly
- implementation should begin now
- the task is already in PR review or merge stages
- the work is tiny execution with no meaningful pre-implementation reasoning phase

## Stage loop

1. Normalize the input with `input-contract.md`.
2. Run `Researcher A` using `roles/researcher/ROLE.md`, `roles/researcher/RUBRIC.md`, and `roles/researcher/LEARNINGS.md` when present.
   - consume available context/evidence first
   - keep answered questions closed unless contradiction or implementation-critical gaps reopen them
   - ask targeted clarifying questions when the desired outcome is fuzzy
   - do not silently fill critical gaps with assumptions
   - return the canonical Researcher packet from `roles/researcher/ROLE.md`
3. For non-trivial research, run `Researcher B attack` with the same role contract.
   - challenge weak evidence
   - challenge unsupported assumptions
   - challenge missing or misclassified unknowns, decisions, and blockers
   - challenge candidate approaches that are over-broad, architecture-by-guess, or implementation-plan-shaped
   - challenge missing `design-test` need for UI/interaction-heavy work
4. If the attack finds fixable gaps, allow one bounded revise/re-review loop unless the caller explicitly approves another.
5. Return one wrapper verdict using `output-contract.md`.

Research wrapper readiness is decided here; human handoff approval is not.

- For non-trivial work, the wrapper verdict is not self-approving.
- Show the research review packet to the user and wait for explicit approval before starting Architect or execution planning.
- Researcher does not decide the final structural/change contract.
- Researcher does not own structural entities, final structural contract, or implementation entity maps.
- Architect, when needed, consumes the challenged Researcher packet and owns the structural contract before execution planning.
- Execution planning must not start while the packet still needs broad discovery or re-litigation of already answered questions.

## Role load rules

- Load Researcher only: `roles/researcher/ROLE.md`, `roles/researcher/RUBRIC.md`, and `roles/researcher/LEARNINGS.md` when present.
- `Researcher A` builds the packet.
- `Researcher B attack` pressure-tests the packet using the same role contract.
- The wrapper returns `critic_findings`, `missing_evidence`, `unresolved_blockers`, `verdict`, and `readiness_note`; those fields do not belong inside `researcher_packet`.
- Architect is downstream of this skill and should not redo generic research.

## Research-closure rules

- `approve_as_is` only when the packet is ready to present for human handoff approval into the appropriate downstream owner within the available context: Architect for architecture-sensitive structural scope, otherwise execution planning.
- `approve_with_changes` when the direction is broadly right but explicit changes or clarifications are needed before handoff. The next stage must wait until those bounded changes are folded back into the Researcher packet.
- `needs_more_research` when key evidence, context, or decisions are still missing.
- `unresolved_blockers` stays empty only when no current blocker remains.
- Missing implementation-critical facts stay here as blockers; do not defer them into implementation unless they are concrete execution-time facts that survived research.

## Anti-patterns

Do not:

- mention GitHub statuses or issue-comment mechanics as if they belong to this skill
- output final structural contracts, implementation entity maps, code blocks, pseudocode, algorithms, edit recipes, exact signatures, command sequences, or patch plans
- bury blockers in narrative
- treat blocking questions as ordinary follow-ups
- re-ask questions that available context already answered
- let the Researcher packet absorb wrapper-level critic findings or verdict language
- let execution planning absorb broad discovery/proposal work when the research wrapper is not ready to present for handoff approval
