# Testing

Use this when validating or revising `research-critic`.

## Trigger prompts

- Research this task and give me proposal plus critic.
- Prepare a pre-implementation readiness packet.
- Take this messy task description and return proposal + critique.
- Do research and critic for this task before implementation.

## Paraphrase prompts

- Break this down, challenge the plan, and say if it is ready.
- Produce a structured research packet with critique.
- Pressure-test this task definition before we start coding.

## Out-of-scope prompts

- Create the GitHub issue and move the board item.
- Implement this approved task now.
- Review the PR and fix the comments.
- Set up the cron job for the board.

## Smoke checks

- `SKILL.md` stays GitHub-agnostic.
- Every file referenced from `SKILL.md` exists.
- The output contract covers both proposal and critic.
- The output contract defines a top-level `unresolved_blockers` field distinct from `follow_ups` and `missing_evidence`.
- When context is unresolved, the workflow requires a separate scannable unresolved/blocking section.
- The workflow does not promise persistence, orchestration, or transport-layer behavior.

## With-skill vs without-skill comparison

Compare one real task description:
- without the skill: does the agent drift into GitHub mechanics or implementation details?
- with the skill: does it return a reusable structured packet with real critique and a clearly surfaced unresolved/blocking section when needed?

The skill is better only if the packet can be reused by multiple adapters without rethinking the content.
