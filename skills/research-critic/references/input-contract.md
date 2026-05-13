# Input Contract

Use this before running the `Researcher A -> Researcher B attack -> wrapper verdict` research stage.

## Required inputs

- Task summary
- Goal or desired outcome
- Known context / facts / evidence

## Optional inputs

- Constraints
- Non-goals
- Decisions already made
- Open questions already known
- Repo or project context
- Domain vocabulary or known entities already named
- Candidate file zones or subsystems, if already known
- Existing acceptance hints
- User preferences or rollout constraints
- UI/design significance and any existing design constraints
- Existing design-test expectations, if already known

## Normalized input shape

- Task summary:
- Goal:
- Known facts and evidence:
- Domain vocabulary / known entities:
- Constraints:
- Non-goals:
- Decisions already made:
- Existing open questions:
- Candidate file zones / systems, if already known:
- Acceptance hints:
- Design-test need: yes/no/unknown
- Design-test hints:
- Missing context already known:

## Rules

- If the source input is messy, normalize it first instead of carrying the mess into the output.
- Preserve resolved decisions and answered questions as closed context unless new evidence contradicts them.
- Do not invent repo/file-zone details, structural entities, or implementation entities when they were not provided or recoverable.
- If the task is too vague, keep the packet honest and let the missing context lower readiness.
- If UI, behavior, or interaction design is materially part of the slice, note whether a `design-test` should be produced as part of research readiness.
- `design-test` here means a compact design-readiness artifact describing intended UI shape, required components, critical states/behavior, and detail expectations strongly enough to guide later implementation/review.
- This contract is intentionally transport-agnostic: the source may be GitHub, chat, notes, cron payloads, or any other adapter.
