# Workflow

This skill is the reusable `research` stage workflow: Researcher -> Critic -> final research verdict. When architecture-sensitive scope remains, the downstream chain is Researcher -> Critic -> Architect -> execution planning/implementation.

It can sit underneath transport adapters such as tickets, cron, chat, or future TaskFlow adapters without owning those adapters.

## When to use it

Use when:
- the task needs a proposal before implementation
- the proposal should be challenged before human review
- the caller needs a structured readiness packet
- the surrounding transport layer should stay thin

Do not use when:
- the ask is to create or update GitHub artifacts directly
- implementation should begin now
- the task is already in PR review or merge stages
- the work is just tiny execution with no meaningful pre-implementation reasoning phase

## Stage loop

1. Normalize the input with `input-contract.md`.
2. Run Researcher using `roles/researcher/ROLE.md`, `roles/researcher/RUBRIC.md`, and `roles/researcher/LEARNINGS.md` to produce the research/proposal packet:
   - consume the available context/evidence first
   - keep answered questions closed unless a contradiction or implementation-critical gap forces them back open
   - ask targeted clarifying questions when the desired outcome is still fuzzy
   - do not silently fill critical gaps with assumptions
   - summary
   - goals / non-goals
   - constraints
   - proposed approach/options, not a final change scope or canonical architectural change list
   - acceptance criteria
   - design-test need for UI-heavy work, if relevant
   - unresolved blockers
   - follow-ups
   - risks
3. Run a separate Critic pass using `roles/critic/ROLE.md`, `roles/critic/RUBRIC.md`, and `roles/critic/LEARNINGS.md`, adapted to research-stage pressure:
   - weak / underspecified areas
   - unsupported assumptions
   - complexity concerns
   - missing evidence
   - final verdict
4. Return one final research verdict using `output-contract.md`.

Research closes here.
- Researcher does not decide final change scope; it makes the evidence, options, risks, and ambiguity visible enough for downstream ownership.
- Architect, when needed, consumes this challenged packet and owns the concrete structural change contract before execution planning/implementation starts.
- Another layer should not start execution planning while the packet still needs broad discovery or re-litigation of already answered questions.

If implementation-critical context is unresolved or blocking questions remain:
- create a distinct `unresolved_blockers` section at the top level of the output
- use it only for the short list that prevents safe execution planning
- keep non-blocking open questions in `follow_ups` or `missing_evidence` instead

## Role load rules

- Load Researcher first: `roles/researcher/ROLE.md`, `roles/researcher/RUBRIC.md`, and `roles/researcher/LEARNINGS.md`.
- Load Critic second: `roles/critic/ROLE.md`, `roles/critic/RUBRIC.md`, and `roles/critic/LEARNINGS.md`.
- Researcher builds the clarification/evidence packet; Critic pressure-tests it; the workflow returns the final research verdict. Architect is downstream of this skill, not a replacement for either pass, and should not redo generic research.

## Critic rules

- Treat `roles/critic/ROLE.md` as the canonical role contract, `roles/critic/RUBRIC.md` as the compact checklist, and `roles/critic/LEARNINGS.md` as durable role memory.
- In this skill, Critic is a research-stage pressure role, not a frozen-scope review gate.
- Critic is not a second research tour.
- Critic should challenge the existing proposal, not rebuild the task from scratch unless a contradiction forces it.
- If the slice materially depends on UI/interaction behavior, critic should challenge whether the packet is missing a required `design-test` or whether the proposed design-test is too vague to guide implementation.
- Keep findings specific and tied to the packet.
- Prefer concrete criticism over vague smart-sounding caution.

## Research-closure rules

- `approve_as_is` only when the packet is ready to hand into the appropriate downstream owner within the available context: Architect for architecture-sensitive structural scope, otherwise execution planning.
- `approve_with_changes` when the direction is broadly right but there are explicit changes or clarifications needed.
- `needs_more_research` when key evidence, context, or decisions are still missing.
- `unresolved_blockers` stays empty only when no current blocker remains.
- Missing implementation-critical facts should stay here as blocker(s); do not defer them into implementation unless they are concrete execution-time facts that survived research.

## Anti-patterns

Do not:
- mention GitHub statuses or issue-comment mechanics as if they belong to this skill
- output implementation recipes, code blocks, patch plans, final change scope, or canonical architectural change lists
- bury the real blocker in a long narrative
- treat blocking questions as ordinary `follow_ups` when they should stop approval or start
- re-ask questions that the available context already answered
- treat critique as politeness instead of pressure-testing
