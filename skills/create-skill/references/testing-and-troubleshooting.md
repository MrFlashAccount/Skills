# Testing and Troubleshooting

Use this file to keep `create-skill` close to Anthropic's guide without bloating the main `SKILL.md`.

## Success criteria before writing

Define success criteria before you draft the skill.

### Quantitative checks
- triggers on most relevant asks
- does not over-trigger on unrelated asks
- completes the intended workflow with minimal correction
- avoids failed tool or script calls during the workflow
- performs better with the skill than without it on the same representative tasks, such as fewer tool calls, fewer retries, or lower token cost

### Qualitative checks
- user does not need to explain the next step manually
- outputs stay structurally consistent across repeated runs
- a new user can succeed from the skill's default path

## Trigger test matrix

Run at least these checks before calling the skill done:
- obvious trigger prompts
- paraphrased trigger prompts
- adjacent but out-of-scope prompts
- real-task prompts taken from the intended workflow

If the skill fails any of these, revise frontmatter or routing.

## Workflow coherence matrix

For any non-trivial skill, test at least one example for each major branch the docs claim to support.
Typical branches include:
- destination or ownership known vs ambiguous
- draft-only vs write-now
- one item vs one item with checklist vs small linked set
- create-only vs update/backfill/field-setting branches when those are claimed

Fail the skill if a branch is described in docs but has no operational closure, no script support where needed, or no explicit stop condition.

## Capability-vs-doc audit

Before calling a skill done, compare:
- frontmatter promises
- `SKILL.md` promises
- references promises
- actual scripts/files and tested workflow

Treat these as review failures:
- docs promise create/update but only create exists
- docs promise linked items but do not define linking strategy or backfill step
- docs imply automatic destination choice where the workflow actually needs clarification
- docs imply project/field/metadata writes that the shipped path does not perform
- docs sound cleaner or broader than the implemented workflow really is

## Frontmatter hard rules

Treat these as fail conditions:
- folder name is not kebab-case
- `SKILL.md` is not named exactly `SKILL.md`
- `name` does not match the folder name closely enough
- `description` does not include both WHAT the skill does and WHEN to use it
- `description` is too generic
- `description` omits trigger phrases users would actually say
- relevant file types or surfaces are missing when they matter
- `description` contains `<` or `>`
- `description` exceeds 1024 characters

Default to minimal frontmatter unless the target runtime explicitly needs more.
Optional metadata like `license`, `compatibility`, or runtime-specific metadata is fine only when the target platform actually uses it; do not add it by default.

## Troubleshooting

### Skill does not trigger
Check:
- is the description too broad or too vague?
- does it include real trigger phrases?
- does it mention the relevant file type, surface, or context?

Debug move:
- ask the model when it would use the skill
- compare that answer to your intended trigger scope
- tighten the description where the answer drifts

### Skill triggers too often
Fix by:
- narrowing the domain
- adding explicit scope boundaries
- adding negative triggers when useful
- removing vague phrases like "helps with" or "works with documents"

### Instructions load but are not followed
Check for:
- critical instructions buried too low
- verbose prose instead of operational steps
- ambiguous language instead of explicit checks
- logic that should be a script instead of free-form text
- branch logic that sounds plausible in prose but is not closed with a real next step or stop condition

### Context feels too heavy
Fix by:
- moving detail from `SKILL.md` into `references/`
- linking references directly instead of repeating them inline
- keeping the always-loaded surface focused on the default path

### Skill sounds polished but still fails on real edge cases
Check for:
- ask surfaces are too abstract and do not reflect what the user will actually say
- destination/ownership ambiguity is not tested
- docs describe one-item vs multi-item routing but never force the critic to test both
- multi-item or backfill behavior is claimed without a deterministic path
- the critic reviewed phrasing and structure but never audited claimed behavior against scripts/tooling

## Patterns worth matching from Anthropic's guide

When the skill needs them, prefer these patterns:
- sequential workflow orchestration
- iterative refinement with explicit stop conditions
- context-aware tool selection
- domain-specific intelligence
- composability with other skills and portability across relevant runtimes or surfaces

Do not force all patterns into every skill. Pick only the ones that match the actual use case.
