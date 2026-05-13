# SPDD-lite

Lightweight four-stage process for non-trivial software work in this repo.

## Stages

1. `research`
   - Goal: decide what should be done before implementation starts.
   - Output: a reusable readiness packet.
   - Covers:
     - task summary
     - goals / non-goals
     - constraints
     - risks
     - open questions
     - unresolved blockers
     - readiness verdict
     - `design-test` need for UI-heavy work
   - Default skill: `skills/research-critic`

2. `execution plan`
   - Goal: convert approved research into an implementation contract. For architecture-sensitive scope, research must first pass through Architect for the structural contract before execution planning/implementation.
   - Output: execution packet with ownership and boundaries.
   - Covers:
     - file zones
     - implementer owners
     - reviewer plan
     - rollback point
     - docs to update
     - sensitive-surface handling
     - `design-test` requirement/status when relevant
   - Default skill: `skills/dev-harness`

3. `development`
   - Goal: implement the approved slice without reopening broad discovery.
   - Output: code + verification evidence + handoff for review.
   - Default skill: `skills/implementation-harness`

4. `review`
   - Goal: adversarial post-implementation judgment against the approved contract.
   - Output: pass/fail verdict with findings and fix guidance.
   - Default skill: `skills/code-review-orchestrator`

## Separation rules

- `research` owns readiness, proposal quality, blockers, and whether UI work requires a `design-test`.
- `execution plan` consumes approved research, or the Architect-owned structural contract when architecture-sensitive scope exists; it must not redo broad discovery or proposal work.
- `development` consumes the approved execution contract; it must not silently widen scope.
- `review` checks the implemented slice against the approved contract; it must not reopen broad task research unless a real contradiction or missing implementation-critical fact appears.

## Design-test rule

If UI, interaction behavior, component composition, or detail-sensitive product presentation is materially in scope, `research` should decide whether a `design-test` is required.

When required, `execution plan` should carry that requirement forward explicitly.

`design-test` means a compact design-readiness artifact that describes:
- intended UI shape
- required components
- critical states and behavior
- notable detail expectations

It is not implementation prose, pixel-perfect mock markup, or a substitute for repo-local design memory.

## Minimal routing

- Small obvious work may compress the amount of ceremony, but should still produce a compact execution plan before development and a distinct review step after development.
- Non-trivial work should still preserve the stage boundaries, even when one assistant/session performs multiple stages.
- If a stage is incomplete, stop there instead of leaking its unresolved work into the next stage.
