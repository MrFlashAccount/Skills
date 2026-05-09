# Create-Skill Checklist

## Mode and approval
- the working mode is explicit: `audit`, `proposal`, or `implement`
- the target skill/folder/source material is explicit
- the user explicitly approved the current substantive phase with `APPROVED` or `LGTM`
- audit approval is not being treated as automatic implementation approval
- if the task moved from audit/proposal into edits, a fresh explicit approval was obtained for the write phase

## Scope handoff
- initial discovery/scoping is already done, or was explicitly routed through `grill-me`
- the target skill is defined enough for the current mode
- representative asks are explicit enough to drive the workflow
- create-vs-rewrite-vs-audit ambiguity is resolved explicitly

## Frontmatter
- `name` exists and matches the folder name
- folder name is kebab-case
- `SKILL.md` is named exactly `SKILL.md`
- `description` says both what the skill does and when to use it
- description includes likely trigger phrases or contexts
- relevant file types, surfaces, or environments are named when they matter
- description stays under 1024 characters
- description contains no `<` or `>`
- description is narrow enough to avoid obvious over-triggering
- optional metadata like `license` or `compatibility` is added only when the target runtime actually uses it

## Structure
- `SKILL.md` contains only the core workflow, stage/mode gates, and hard rules
- detailed material moved to `references/` where appropriate
- `scripts/` added only for deterministic repeated work
- `assets/` added only for output resources
- no extra docs like README, QUICKSTART, CHANGELOG, or INSTALL notes inside the skill

## Content quality
- instructions are imperative and operational
- routing guidance is explicit
- mode handling is explicit
- approval semantics are explicit
- anti-patterns or boundaries are named when they matter
- duplicate content between `SKILL.md` and references has been reduced
- the always-loaded file is concise relative to the task
- sensitive-surface risks were checked when the skill touches personal docs, local paths, prompts/examples, logs, or retained user data
- representative ask surfaces are explicit enough to drive the workflow, not just implied by abstract prose
- claimed capabilities match shipped files, scripts, and default flow; docs do not promise unsupported behavior
- ambiguous routing cases such as destination/project/repo choice, write-vs-audit mode, and one-item-vs-multi-item splits are resolved explicitly
- if the skill claims a branch like linked sets, updates, field-setting, or backfill, that branch is operationally closed rather than hand-waved
- if the workflow has repeated draft/review/fix handoffs or no-partial-output gates, the author explicitly checked whether it should be modeled as a state machine

## Progressive disclosure
- each reference file is linked directly from `SKILL.md`
- variant-specific guidance is separated from the main path
- large files are worth their token cost
- the skill remains composable with other skills and portable across relevant runtimes or surfaces when that matters

## Review loop
- first draft completed before review starts
- critic review run at least 2 times for non-trivial implementation/rewrite work
- fix pass completed after each critic review
- 3rd critic/fix round added when ambiguity or bloat remains
- latest review issues are actually resolved, not just acknowledged
- at least one critic pass explicitly audits ask-surface coverage, workflow coherence, and capability-vs-doc drift
- if the skill text stayed wordy after the main review loop, a late-stage `forthright` compression pass was considered or run
- if `forthright` compression ran, one final sanity review checked that no trigger boundary, safety rule, or workflow branch was weakened

## Testing
- tested on representative prompts
- paraphrased trigger prompts tested
- adjacent out-of-scope prompts tested
- obvious failure modes checked
- repeated code paths extracted into scripts when justified
- examples align with the actual workflow
- trigger quality and false-positive rate were reviewed explicitly
- at least one with-skill vs without-skill comparison was checked on a representative task when the workflow is substantial enough
- at least one branch/edge-case matrix was checked: mode ambiguity, destination ambiguity, write-vs-audit, one-item vs checklist vs linked set, or equivalent domain-specific branches
- for every deterministic script-backed claim, at least a smoke test or capability audit was run
- for iterative review loops, leakage between unfinished and finished states was tested explicitly

## Finalization
- the finished result matches the approved mode
- if edits were made, the post-implementation review gate was run
- skill folder is complete and internally consistent
- all referenced files/scripts/assets actually exist
- real user docs, absolute machine paths, and repo-visible private data are not embedded in references/assets/examples/logs
- privacy/data-safety review was run when the skill handles personal docs, local paths, prompt/example content, or retained user data
- source-only repo workflow stays consistent with the surrounding repo rules
