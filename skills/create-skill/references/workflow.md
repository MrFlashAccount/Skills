# Create-Skill Workflow

Use this file when building or rewriting a skill from source material such as a PDF, spec, SOP, prompt pack, or an existing skill.

This workflow starts after initial scoping. If the target skill is still fuzzy, route that first-pass discovery through `grill-me`, then come back here for execution.

Hard gate: after scoping and before implementation, present the proposed skill shape and wait for the user's explicit `ПОДТВЕРЖДАЮ`. Do not start creating the skill structure before that approval.

## 1. Start from concrete examples

Do not begin with abstract categories alone.
Do not use this stage to discover the whole problem from scratch; arrive with a scoped target.

Collect or infer a short set of representative asks:
- what the user would say
- what success looks like
- what must be deterministic vs flexible

If the source is a long document, reduce it to repeated use cases first.

## 2. Define success criteria

Before drafting, decide how you will know the skill is good enough.

Minimum checks:
- trigger quality on real prompts
- low false-positive rate on adjacent prompts
- successful completion of the intended workflow
- stable output quality across repeated tests
- a representative with-skill vs without-skill comparison when the workflow is substantial enough to measure

Use `references/testing-and-troubleshooting.md` for the detailed test matrix and failure modes.

## 3. Plan the skill structure before writing

Choose only the files that help execution:

- `SKILL.md`: trigger metadata and the default execution flow
- `references/`: detailed docs, policies, schemas, decision trees, variant-specific guidance
- `scripts/`: deterministic code for repeated transformations or brittle operations
- `assets/`: templates, boilerplate, icons, samples, or output resources

Do not create extra docs that are not part of runtime behavior.
If the target runtime supports optional metadata like `license` or `compatibility`, add it only when it is actually consumed there.
If the skill touches personal docs, local paths, prompts/examples, logs, or retained user data, mark it as a sensitive surface up front and plan a privacy/data-safety review before finalization.

## 4. Set the right degree of freedom

Pick instruction style based on fragility:

- **High freedom**: multiple valid approaches; use concise heuristics
- **Medium freedom**: preferred pattern exists; use short rules, pseudocode, or structured steps
- **Low freedom**: the sequence is brittle or costly to get wrong; use explicit steps and minimal branching

## 5. Design for progressive disclosure

Keep the always-loaded surface small.

- metadata should trigger correctly
- `SKILL.md` should stay focused on the default operating path
- large details should move into `references/`
- reference files should be linked directly from `SKILL.md`

One good rule: if a section is useful only in some cases, it probably belongs in `references/`.
Also check whether the skill should compose cleanly with neighboring skills and remain portable across the runtimes or surfaces it is meant to serve.

## 6. Write strong frontmatter

The frontmatter is the trigger layer.
Treat bad frontmatter as a hard failure, not a polish issue.

### `name`
- lowercase
- hyphenated
- short
- action-oriented when possible

### `description`
Include:
- what the skill does
- when to use it
- likely user phrasings, contexts, or adjacent requests that should trigger it
- relevant file types, surfaces, or environments when they materially affect triggering

Do not rely on the body to explain trigger conditions.
Hard rules: keep it under 1024 characters, avoid `<` and `>`, and fail fast if the wording is broad enough to trigger on unrelated asks.

## 7. Write the body like an operator manual

Good skill bodies:
- route the task quickly
- tell the agent what to do first
- show what to load next and when
- encode sharp rules and anti-patterns
- stay concise

Bad skill bodies:
- re-explain common concepts at length
- read like marketing copy
- mix core flow with bulky reference material
- add theory without operational effect

## 8. Decide when to add scripts

Add a script when:
- the same code gets rewritten repeatedly
- deterministic reliability matters
- the script can be executed instead of re-derived from text each time

Do not add scripts only because code would look impressive.

## 9. Run the critic/fix loop

After the first draft, do a structured review pass before finalizing.

Default loop:
1. draft the skill
2. run critic review
3. fix the issues
4. run critic review again
5. fix again

Stop after 2 review/fix iterations if the skill is clean.
Run a 3rd review/fix iteration when:
- trigger wording is still fuzzy
- `SKILL.md` is still bloated
- file boundaries are still unclear
- references are still carrying duplicate material
- the workflow still feels ambiguous on real prompts

Critic focus:
- trigger quality in frontmatter
- whether `SKILL.md` is too large or too vague
- whether detail should move into `references/`
- whether repeated manual work should become `scripts/`
- whether the skill would actually be easy to use on a real task

## 10. Test the skill on real prompts

Validate with representative asks.

Check:
- did the metadata trigger the right use case?
- did paraphrases still trigger?
- did adjacent out-of-scope prompts stay quiet?
- did the body route the task cleanly?
- was any key detail missing from always-loaded guidance?
- did bulky details stay out of `SKILL.md`?
- should any repeated manual step become a script?
- if the skill is a sensitive surface, were local paths, personal docs, and prompt/example content redacted or kept out of repo-visible files?

## 11. Finalize and iterate

Review the finished skill folder, fix any broken references or workflow gaps, and revise based on actual use.
For sensitive-surface skills, do not call it done until privacy/data-safety review either finds a concrete issue or explicitly clears the approved scope.

Iteration loop:
1. run the skill on a real task
2. note where it was weak, bloated, or ambiguous
3. tighten the flow or split material better
4. retest
