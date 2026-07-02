# Testing

Use this when validating or revising `research-critic`.

## Trigger prompts

- Research this task and give me a challenged research verdict.
- Prepare a pre-implementation `reasons-canvas-research`.
- Take this messy task description and return a challenged research verdict.
- Run Researcher A plus Researcher B attack for this task before downstream ownership.

## Paraphrase prompts

- Break this down, challenge the plan, and say if it is ready.
- Produce a structured Research Canvas with an attack pass and wrapper verdict.
- Pressure-test this task definition before we start coding.

## Out-of-scope prompts

- Create the GitHub issue and move the board item.
- Implement this approved task now.
- Review the PR and fix the comments.
- Set up the cron job for the board.

## Smoke checks

- `SKILL.md` stays GitHub-agnostic.
- Every file referenced from `SKILL.md` exists.
- The output contract keeps `reasons-canvas-research` distinct from wrapper-level critic findings.
- The output contract defines a top-level `unresolved_blockers` field distinct from `missing_evidence`.
- When context is unresolved, the workflow requires a separate scannable unresolved/blocking section.
- The workflow does not promise persistence, orchestration, or transport-layer behavior.

## With-skill vs without-skill comparison

Compare one real task description:
- without the skill: does the agent drift into GitHub mechanics or implementation details?
- with the skill: does it return a reusable structured Research Canvas, wrapper-level attack findings, and a clearly surfaced unresolved/blocking section when needed?

The skill is better only if the Canvas can be reused by multiple adapters without rethinking the content.
