# Input Contract

Use this before running the research + critic stage.

## Required inputs

- Task summary
- Goal or desired outcome
- Known context / facts

## Optional inputs

- Constraints
- Non-goals
- Decisions already made
- Open questions already known
- Repo or project context
- Candidate file zones or subsystems
- Existing acceptance criteria
- User preferences or rollout constraints

## Normalized input shape

- Task summary:
- Goal:
- Known facts:
- Constraints:
- Non-goals:
- Decisions already made:
- Existing open questions:
- Candidate file zones / systems:
- Acceptance hints:
- Missing context already known:

## Rules

- If the source input is messy, normalize it first instead of carrying the mess into the output.
- Preserve resolved decisions and answered questions as closed context unless new evidence contradicts them.
- Do not invent repo/file-zone details when they were not provided or recoverable.
- If the task is too vague, keep the packet honest and let the missing context lower readiness.
- This contract is intentionally transport-agnostic: the source may be GitHub, chat, notes, cron payloads, or any other adapter.
