# Workflow

This skill is the reusable research + critic stage that can sit underneath GitHub, cron, chat, or future TaskFlow adapters.

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
2. Produce the research/proposal packet:
   - consume the available context/evidence first
   - keep answered questions closed unless a contradiction or implementation-critical gap forces them back open
   - summary
   - goals / non-goals
   - constraints
   - proposed approach
   - acceptance criteria
   - design-test need for UI-heavy work, if relevant
   - unresolved blockers
   - open questions
   - risks
3. Run a separate critic pass against that packet using `roles/critic/ROLE.md` plus `roles/critic/RUBRIC.md`, adapted to research-stage pressure:
   - weak / underspecified areas
   - unsupported assumptions
   - complexity concerns
   - missing evidence
   - final verdict
4. Return the output using `output-contract.md`.

Research closes here.
- Another layer should not start execution planning while the packet still needs broad discovery or re-litigation of already answered questions.

If context is unresolved or questions remain:
- create a distinct `unresolved_blockers` section at the top level of the output
- use it for the short list a reader should see first
- do not bury blocking items in long prose, `open_questions`, or `missing_evidence` alone

## Critic rules

- Load `roles/critic/ROLE.md` as the canonical role contract and `roles/critic/RUBRIC.md` as the compact checklist.
- In this skill, Critic is a research-stage pressure role, not a frozen-scope review gate.
- Critic is not a second research tour.
- Critic should challenge the existing proposal, not rebuild the task from scratch unless a contradiction forces it.
- If the slice materially depends on UI/interaction behavior, critic should challenge whether the packet is missing a required `design-test` or whether the proposed design-test is too vague to guide implementation.
- Keep findings specific and tied to the packet.
- Prefer concrete criticism over vague smart-sounding caution.

## Research-closure rules

- `approve_as_is` only when the packet is ready to hand into execution planning within the available context.
- `approve_with_changes` when the direction is broadly right but there are explicit changes or clarifications needed.
- `needs_more_research` when key evidence, context, or decisions are still missing.
- `unresolved_blockers` stays empty only when no current blocker remains.
- Missing implementation-critical facts should stay here as blocker(s); do not defer them into implementation unless they are concrete execution-time facts that survived research.

## Anti-patterns

Do not:
- mention GitHub statuses or issue-comment mechanics as if they belong to this skill
- output implementation recipes, code blocks, or patch plans
- bury the real blocker in a long narrative
- treat blocking questions as ordinary `open_questions` when they should stop approval or start
- re-ask questions that the available context already answered
- treat critique as politeness instead of pressure-testing
