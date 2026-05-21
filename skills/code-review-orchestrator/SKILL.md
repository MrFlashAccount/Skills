---
name: code-review-orchestrator
description: Orchestrate multi-role code reviews for any repository, branch, PR, or diff. Use when the user asks for code review / кодревью, wants a review of a repo/path/branch/PR, or wants a merged report from specialist perspectives such as critic, architect, backend, frontend, frontend taste, security, privacy/data-safety, qa/reliability, or performance. Also use when the user wants one global review command that fans out to the relevant reviewers, returns an explicit pass/fail review verdict for non-trivial work, and merges must-fix / should-fix / can-delay findings.
---

# Code Review Orchestrator

## Goal
Run one review entrypoint, choose the right reviewer set from the canonical post-implementation roles, spawn those reviewers in parallel, and merge their findings into one actionable report. Do not collapse this into a manual self-review in the orchestrator session just because the diff looks small or speed would be higher.

If required reviewer delegation is unavailable, fails to start, or cannot be used, stop as `blocked` and report that state; do not replace the delegated review gate with a manual review in the orchestrator session.

This is stage 4, the post-implementation review gate. The pre-implementation `research` flow lives in `research-critic`, and `execution plan` lives in `dev-harness`. For non-trivial code work, this gate should act as an adversarial contract check with binary pass/fail semantics, not a soft advisory lap.

## Canonical reviewer roles
Use these role labels as the canonical review stack:
- `critic`
- `architect`
- `backend`
- `frontend`
- `frontend taste`
- `security`
- `privacy/data-safety`
- `qa/reliability`
- `performance`

Do not treat `staff engineer`, generic `designer`, `financial/risk`, or `reliability/QA` as canonical reviewer labels here. If the target repo has repo-specific review guidance in `AGENTS.md`, map it onto the closest canonical role instead of inventing a new default label.

## Workflow
1. Identify the target repo/path/ref/PR and the base comparison.
2. Read the target repo’s `AGENTS.md` first, then gather compact context, approved contract or acceptance criteria when available, `git status`, current branch, `git diff --stat`, touched files, relevant tests, docs, and config.
3. For `sensitive-surface` diffs, run `scripts/check_sensitive_surface.py <repo-path> [<base-rev>]` from this skill and include its output in the shared brief.
4. Build one shared brief, then choose reviewers by primary risk:
   - `critic` for simplification, trade-offs, hidden fragility, or scope pressure
   - `architect` for seams, layering, dependency shape, file-zone correctness, request-path boundaries, balanced coupling, architecture-memory integrity, and architectural drift from the approved slice
   - `backend` for backend/server correctness
   - `frontend` for client-side correctness, state, routing, async behavior, and contract consumption
   - `frontend taste` for visual/presentation quality on rendered user-facing surfaces; select `frontend taste` as the canonical reviewer role, include only its `ROLE.md`/`RUBRIC.md` load requirement, and tell the worker to follow the loaded role files for any additional references
   - `security` for exploitability, auth, privilege, and trust-boundary regressions
   - `privacy/data-safety` for local-path leakage, committed personal docs, prompt/example leakage, retained user data, unsafe persistence, and consent/retention mistakes
   - `qa/reliability` for failure handling, rollback/recovery, degraded behavior, flaky paths, and test signal
   - `performance` for hot-path latency, throughput, CPU/memory/network waste, or leaks
5. Spawn only the reviewers the slice actually needs.
   - default to one independent reviewer
   - add more roles only when the primary risks are genuinely separate
   - for `sensitive-surface` diffs, `privacy/data-safety` is mandatory even if the code diff is tiny
6. Ask each reviewer for:
   - pass or fail against the approved contract,
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
   - after an in-scope fix pass, prefer a fresh independent reviewer for re-review by default; reuse the same reviewer only when reviewer availability is constrained and the slice stayed within frozen scope
   - re-review must preserve the contract/docs drift check and must not narrow only to the original code finding when the fix touched a contract-bearing surface
10. For every code task, keep a review gate in the loop; the question is only how much review depth is needed.
11. Do not treat implementer completion notes as authoritative for non-trivial work; the slice stays open until validation and independent review pass.

## Role selection rules
- Default to one independent reviewer.
- Choose reviewers from the canonical role set by task context; do not invent new default labels.
- Use `critic` when the main question is simplification, scope pressure, hidden fragility, or trade-offs.
- Use `architect` when the main question is seams, layering, dependency direction, file-zone boundaries, request-path shape, balanced coupling, architecture-memory integrity, or whether the implementation matches the intended architecture of the approved slice.
- `architect` is mandatory when the approved slice introduced or reshaped backend/service/adaptor seams across multiple zones and those boundaries are a primary review risk.
- `architect` is mandatory for final/re-review passes when implementation changes or may change contract-bearing docs, artifacts, states, schemas, workflows, process contracts, or symbolic lifecycle values, unless the approved execution contract explicitly assigns that drift gate to another reviewer as an approved exception.
- `architect` is recommended for non-trivial backend refactors, platforming, or coupling-sensitive work even when one `backend` reviewer could probably catch plain correctness issues.
- `architect` is usually unnecessary for tiny single-zone fixes with no boundary, ownership, layering, or architecture-artifact risk.
- even for tiny slices, if durable architecture-artifact ownership or architecture-memory integrity is in doubt, route `architect` explicitly instead of leaving that check implicit.
- Use `backend` for backend/server correctness.
- Use `frontend` for frontend/client correctness; for React/Next.js slices, require only `../../roles/frontend/ROLE.md` and `../../roles/frontend/RUBRIC.md` directly, then let the loaded role files decide any additional React-specific references.
- Use `frontend taste` for visual/presentation quality on rendered UI surfaces; select `frontend taste` as the canonical reviewer role, require only its `ROLE.md`/`RUBRIC.md` direct loads, and let the loaded role files decide any additional references.
- Use `security` when the diff may change exploitability or trust boundaries.
- Use `privacy/data-safety` for `sensitive-surface` diffs.
- For `sensitive-surface` diffs, run the scanner and do not call the review clean until `privacy/data-safety` explicitly clears the approved scope or reports a concrete risk.
- Use `qa/reliability` when failure handling, rollback/recovery, diagnosability, or test signal is the main concern.
- Use `performance` when the diff touches hot paths, loops, IO, large data handling, render churn, or resource cost.
- Add more than one reviewer only when the primary risks are independent enough that one role should not absorb the others.
- If the target repo asks for a repo-specific review lens, keep the canonical role label and pass the repo-specific guidance inside the brief.
- Even when the change is small, there should still be at least one review pass; trivial work gets a lighter review, not no review.
- For non-trivial code work, at least one reviewer must return an explicit pass/fail verdict against the approved contract.

## How to run it
Before any `sessions_spawn`, read [references/role-prompts.md](references/role-prompts.md) and include its selected phase overlay in the worker prompt. A reviewer label alone is never sufficient.

Use `sessions_spawn` to create one subagent per role, with the target repo as `cwd` and a shared compact brief. Even for small diffs, keep the review gate as delegated reviewer work rather than replacing it with an in-orchestrator review.

Each reviewer prompt must include:
- the applicable section from [references/role-prompts.md](references/role-prompts.md), including the selected role/phase overlay prompt
- an instruction to load the selected role material before judging the diff
- an instruction to follow all instructions in loaded role material, including loading additional role material, references, rubrics, learnings, or task guidance when the loaded role material requires it
- an instruction to satisfy any final-answer requirements defined by the loaded role material, or return `blocked` if required material cannot be loaded or final-answer requirements cannot be satisfied

Do not accept reviewer output for a required gate when required role material cannot be loaded or the role material's final-answer requirements cannot be satisfied. Mark that reviewer gate `blocked` instead.

If the delegated reviewer path is unavailable, fails to start, or cannot be used, stop as `blocked` instead of reviewing directly in the orchestrator session.

Keep each role prompt short and specific. Include the approved contract or compact acceptance criteria when available, plus only the diff summary, target branch/PR, the review focus for that role, the project’s `AGENTS.md` guidance, and the merge rubric.

Suggested reviewer prompt shape:

> Review this diff as the {role}. Approved contract: {contract-summary}. Focus on {focus}. Judge it adversarially against that contract. Return only: pass/fail, must-fix / should-fix / can-delay, evidence, and confidence. Call out file:line when possible. If nothing is wrong, say so briefly.

Add the selected phase overlay from [references/role-prompts.md](references/role-prompts.md) before that instruction, and require the reviewer to satisfy the loaded role material's final-answer requirements.

For `architect`, bias the prompt toward the planning-fixed architecture contract, seam decisions, dependency correctness, file ownership/zone boundaries, source-layout expectations, request-path boundaries, balanced coupling, architecture-memory integrity, and whether the implementation introduces unnecessary coupling, unapproved flat/global responsibility placement, or the wrong abstraction layer.

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
- For non-trivial work, the merged verdict must say whether the approved contract passed or failed review.
- For non-trivial or contract-bearing work, the merged verdict must say whether contract/docs drift was checked and cleared, failed, or `not-required` for non-contract-bearing work.
- For `sensitive-surface` diffs, say explicitly whether `privacy/data-safety` and `security` were run, and which one cleared the slice.
