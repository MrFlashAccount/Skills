---
name: code-review-orchestrator
description: Orchestrate multi-role code reviews for any repository, branch, PR, or diff. Use when the user asks for code review / кодревью, wants a review of a repo/path/branch/PR, or wants a merged report from specialist perspectives such as staff engineer, security, privacy/data-safety, performance, financial/risk, reliability/QA, or frontend design taste. Also use when the user wants one global review command that fans out to several reviewers and returns one merged must-fix / should-fix / can-delay report.
---

# Code Review Orchestrator

## Goal
Run one review entrypoint, spawn specialist reviewers in parallel, and merge their findings into one actionable report.

This is the post-implementation critic gate. The pre-implementation critic/debate lives in `dev-harness`.

## Workflow
1. Identify the target repo/path/ref/PR and the base comparison.
2. Read the target repo’s `AGENTS.md` first, then gather compact context, `git status`, current branch, `git diff --stat`, touched files, relevant tests, docs, and config.
3. Build one shared brief, then spawn the core reviewers:
   - staff engineer,
   - performance,
   - financial/risk,
   - reliability/QA.
   Add `security` when exploitability/auth/trust-boundary risk is present.
   Add `privacy/data-safety` when the diff is `sensitive-surface`: local files, personal docs, prompt/example content, logs/traces, retained user data, machine-specific paths, or external sends carrying user content.
   If the diff is frontend, UI, UX, visual, motion, or user-facing output, also spawn a designer reviewer using the `design-taste-frontend` skill.
4. For `sensitive-surface` diffs, run `skills/dev-harness/scripts/check_sensitive_surface.py <repo-path> [<base-rev>]` first and include its output in the shared brief.
5. Ask each reviewer for:
   - blocker or not,
   - evidence,
   - file and line when possible,
   - confidence,
   - must-fix / should-fix / can-delay.
   Add a simplification check to the critic voice: can this be simpler, cheaper, or better optimized?
6. Merge results:
   - dedupe repeated issues,
   - elevate only evidence-backed blockers,
   - preserve disagreements,
   - group by file/theme,
   - put must-fix first.
7. Return a short report with a clear verdict and next step.
8. When the user wants an iterative loop, feed the report back into the same review process and repeat up to 3 passes total.
9. For every code task, keep a review gate in the loop; the question is only how much review depth is needed.

## Role selection rules
- Always include staff engineer.
- Always include reliability/QA.
- Include security if the diff touches auth, secrets, external sends, parsers, access control, or user input in a way that could change exploitability or trust boundaries.
- Include `privacy/data-safety` for `sensitive-surface` diffs.
- For `sensitive-surface` diffs, run the scanner and do not call the review clean until `privacy/data-safety` explicitly clears the approved scope or reports a concrete risk.
- Include performance if the diff touches hot paths, loops, IO, or large data handling.
- Include financial/risk if the repo is trading, payments, sizing, slippage, fees, or loss-sensitive logic.
- Include a designer reviewer if the diff is frontend, UI, UX, visual, motion, or user-facing output. Use the `design-taste-frontend` skill for that reviewer.
- If a role is not clearly relevant, keep it anyway only when the user explicitly asked for the full multi-role review.
- The critic should not only hunt defects; it should also pressure the solution toward simpler, cheaper, and more optimized alternatives.
- Even when the change is small, there should still be at least one review pass; trivial work gets a lighter review, not no review.

## How to run it
Use `sessions_spawn` to create one subagent per role, with the target repo as `cwd` and a shared compact brief.

Keep each role prompt short and specific. Include only the diff summary, target branch/PR, the review focus for that role, the project’s `AGENTS.md` guidance, and the merge rubric.

Suggested reviewer prompt shape:

> Review this diff as the {role}. Focus on {focus}. Return only: must-fix / should-fix / can-delay, evidence, and confidence. Call out file:line when possible. If nothing is wrong, say so briefly.

## If context is missing
Ask only for the missing target, repo path, branch, or PR.

## Output format
- Summary
- Must fix
- Should fix
- Can delay
- Disagreements / needs more context
- Suggested next step

## Merge rules
- Prefer evidence over vibe.
- Treat one high-confidence blocker as enough to stop the line.
- Do not collapse disagreements into mush, keep both sides.
- If all reviewers are clean, say that plainly and mention the highest-risk area that was checked.
- For `sensitive-surface` diffs, say explicitly whether `privacy/data-safety` and `security` were run, and which one cleared the slice.
