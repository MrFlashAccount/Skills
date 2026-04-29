---
name: code-review-orchestrator
description: Orchestrate multi-role code reviews for any repository, branch, PR, or diff. Use when the user asks for code review / кодревью, wants a review of a repo/path/branch/PR, or wants a merged report from specialist perspectives such as critic, staff backend, staff frontend, frontend taste, security, privacy/data-safety, qa/reliability, or performance. Also use when the user wants one global review command that fans out to the relevant reviewers and returns one merged must-fix / should-fix / can-delay report.
---

# Code Review Orchestrator

## Goal
Run one review entrypoint, choose the right reviewer set from the canonical post-implementation roles, spawn those reviewers in parallel, and merge their findings into one actionable report.

This is the post-implementation review gate. The pre-implementation proposal/critic/debate flow lives in `dev-harness`.

## Canonical reviewer roles
Use these role labels as the canonical review stack:
- `critic`
- `staff backend`
- `staff frontend`
- `frontend taste`
- `security`
- `privacy/data-safety`
- `qa/reliability`
- `performance`

Do not treat `staff engineer`, generic `designer`, `financial/risk`, or `reliability/QA` as canonical reviewer labels here. If the target repo has repo-specific review guidance in `AGENTS.md`, map it onto the closest canonical role instead of inventing a new default label.

## Workflow
1. Identify the target repo/path/ref/PR and the base comparison.
2. Read the target repo’s `AGENTS.md` first, then gather compact context, `git status`, current branch, `git diff --stat`, touched files, relevant tests, docs, and config.
3. For `sensitive-surface` diffs, run `scripts/check_sensitive_surface.py <repo-path> [<base-rev>]` from this skill and include its output in the shared brief.
4. Build one shared brief, then choose reviewers by primary risk:
   - `critic` for simplification, trade-offs, hidden fragility, or scope pressure
   - `staff backend` for backend/server correctness
   - `staff frontend` for client-side correctness, state, routing, async behavior, and contract consumption
   - `frontend taste` for visual/presentation quality on rendered user-facing surfaces; use the `design-taste-frontend` skill for that reviewer
   - `security` for exploitability, auth, privilege, and trust-boundary regressions
   - `privacy/data-safety` for local-path leakage, committed personal docs, prompt/example leakage, retained user data, unsafe persistence, and consent/retention mistakes
   - `qa/reliability` for failure handling, rollback/recovery, degraded behavior, flaky paths, and test signal
   - `performance` for hot-path latency, throughput, CPU/memory/network waste, or leaks
5. Spawn only the reviewers the slice actually needs.
   - default to one independent reviewer
   - add more roles only when the primary risks are genuinely separate
   - for `sensitive-surface` diffs, `privacy/data-safety` is mandatory even if the code diff is tiny
6. Ask each reviewer for:
   - blocker or not,
   - evidence,
   - file and line when possible,
   - confidence,
   - must-fix / should-fix / can-delay.
7. Merge results:
   - dedupe repeated issues,
   - elevate only evidence-backed blockers,
   - preserve disagreements,
   - group by file/theme,
   - put must-fix first.
8. Return a short report with a clear verdict and next step.
9. When the user wants an iterative loop, feed the report back into the same review process and repeat up to 3 passes total.
10. For every code task, keep a review gate in the loop; the question is only how much review depth is needed.

## Role selection rules
- Default to one independent reviewer.
- Choose reviewers from the canonical role set by task context; do not invent new default labels.
- Use `critic` when the main question is simplification, scope pressure, hidden fragility, or trade-offs.
- Use `staff backend` for backend/server correctness.
- Use `staff frontend` for frontend/client correctness; if the touched slice is React/Next.js, also load `vercel-react-best-practices`.
- Use `frontend taste` for visual/presentation quality on rendered UI surfaces; use the `design-taste-frontend` skill for that reviewer.
- Use `security` when the diff may change exploitability or trust boundaries.
- Use `privacy/data-safety` for `sensitive-surface` diffs.
- For `sensitive-surface` diffs, run the scanner and do not call the review clean until `privacy/data-safety` explicitly clears the approved scope or reports a concrete risk.
- Use `qa/reliability` when failure handling, rollback/recovery, diagnosability, or test signal is the main concern.
- Use `performance` when the diff touches hot paths, loops, IO, large data handling, render churn, or resource cost.
- Add more than one reviewer only when the primary risks are independent enough that one role should not absorb the others.
- If the target repo asks for a repo-specific review lens, keep the canonical role label and pass the repo-specific guidance inside the brief.
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
