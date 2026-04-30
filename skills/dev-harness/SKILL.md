---
name: dev-harness
description: Orchestrate software work through discovery/proposal/implementation/review subagents with explicit contracts, isolated file zones, and a living knowledge base. Use when planning, delegating, or reviewing implementation/refactor tasks, especially multi-file, risky, or sliceable work, or when durable learnings should be captured.
---

# Dev Harness

Use as the top-level coding harness. You orchestrate discovery, proposal, implementation routing, and review. Under this skill, the orchestrator does not directly implement the approved slice; implementer workers do.

Keep path small. Use the full harness only when needed.

## When to use

- Use for one-file fixes too; keep the path minimal.
- Use the full harness for multi-file, multi-domain, or risky work.
- If the task is vague, write the contract first.

## Read order

Read only the references needed for the current phase; do not load every role by default.

- Before proposal for non-trivial or ownership-unclear work, read [references/task-contract.md](references/task-contract.md).
- If the slice may touch local files, personal docs, prompts/examples, logs, retained user data, or machine-specific paths, read [references/sensitive-surfaces.md](references/sensitive-surfaces.md) before proposal.
- After approval, read only the relevant implementer sections in [references/roles/implementers.md](references/roles/implementers.md).
- Before review, read [references/review-policy.md](references/review-policy.md) and only the relevant reviewer sections in [references/roles/reviewers.md](references/roles/reviewers.md).
- If routing is ambiguous or you want a sanity check on expected worker/reviewer choice, read [references/examples.md](references/examples.md).
- Read the knowledge base only when relevant:
  - [references/knowledge/facts.md](references/knowledge/facts.md)
  - [references/knowledge/lessons.md](references/knowledge/lessons.md)
  - [references/knowledge/open-questions.md](references/knowledge/open-questions.md)

## Task class

- `tiny`: obvious, narrow, low-risk, usually one file / one intent.
- `non-trivial`: risky, ambiguous, multi-zone, user-facing, security-sensitive, privacy/data-sensitive, or easy to get subtly wrong.
- If unsure, treat the task as `non-trivial`.

## Workflow

1. Read the existing task context and the knowledge base when relevant.
2. Discovery contract: before proposal, do discovery.
   - default to one read-only discovery worker; use more only for multi-zone or non-trivial inspection
   - discovery workers may inspect, search, summarize, map candidate file zones, and identify risks/unknowns
   - discovery is facts-first: no recommendations, no edit plans, no architecture nudges, no code-ish artifacts
   - every material claim should be evidence-backed with file/line/symbol when practical; otherwise mark it as an assumption or unknown
   - use safe reads/searches only; no edits, no patches, and no builds/tests/scripts unless explicitly required for inspection
   - stop when there are enough facts for proposal, or when remaining gaps are real unknowns/blockers; do not keep touring the repo
   - discovery output shape: `Facts / Evidence / Risks / Unknowns / Questions for user / Candidate file zones / Sensitive-surface classification`
3. Write one short proposal from the discovered facts, then run proposal critique against it.
   - default proposal template: `Goal / Non-goals / File zones / Acceptance / Rollback / Unknowns-or-assumptions`
   - for `tiny` work, use a 3-4 bullet proposal instead of the full template
   - if the slice is or might be `sensitive-surface`, extend the proposal with: `Sensitive inputs / Persistence / Exposure surface / Reviewer plan`
   - if the slice touches backend request-path, persistence, or async runtime behavior, also name: `Request-path impact / Contract touchpoints / Docs-to-update`
   - classify as `sensitive-surface` by default when the slice touches any of: local files, personal docs, `references/`, `assets/`, prompts/examples, logs/traces, retained user data, external sends, or machine-specific paths
   - keep one recommended path; add at most one alternative only if it materially changes risk or scope
   - show one cleaned proposal to the user before coding
   - this gate is mandatory for every code task, even tiny ones
   - after proposal, stop; continue only after explicit approval
   - approval means `ПОДТВЕРЖДАЮ` or an equally explicit go-ahead; `ок`, `ага`, `ясно`, and similar weak acknowledgements are not approval
   - before approval, proposals may include goals, risks, and architecture, but not code blocks, pseudocode, function/class skeletons, exact file-by-file edit recipes, command sequences, SQL/migrations, exact signatures, patch-like diffs, or ready-to-apply code
4. Choose the lightest viable implementation path after approval.
   - simple one-file / low-risk fix: launch one narrow implementer worker, minimal scope only if the slice is not `sensitive-surface`
   - ambiguous, multi-file, multi-domain, or risky work: use the fuller pipeline
   - canonical implementer role labels are only `backend` and `frontend`
   - use only the implementers actually needed for the approved slice
   - for large tasks, multiple `backend` and/or multiple `frontend` implementers are allowed in parallel only when each owns a distinct file zone or exclusive feature slice with no overlap
   - stay in orchestrator role; workers implement and review
   - if delegated Codex CLI returns auth or rate_limit errors, stop and notify the user; do not patch around it by hand
   - before or when launching workers, send one short status note naming active workers and ownership
5. During implementation, keep the critic out of the coding loop.
   - one owner per file zone; group tightly coupled files into one zone
   - `feature slice` is valid only when it maps to one closed, exclusive file set with one owner
   - if the task cannot be partitioned into clean non-overlapping file zones, collapse it to one implementer instead of inventing pseudo-slices
   - run the smallest meaningful verification before review and report what ran or what could not run
   - for `sensitive-surface` slices, run `scripts/check_sensitive_surface.py <repo-path> [<base-rev>]` before review and include its result in the review brief
   - do not dump raw subagent output, logs, or transcripts into chat; summarize in your own words
6. Result review gate: after implementation, run review.
   - review is mandatory after every implementation pass
   - for `sensitive-surface` work, `privacy/data-safety` review is mandatory even if the code diff is tiny
   - keep `security` separate: it covers exploitability/auth/trust-boundary regressions; `privacy/data-safety` covers local paths, personal docs, retained user data, prompt/example leakage, and consent/retention mistakes
   - default to one independent reviewer; use `code-review-orchestrator` for non-trivial, risky, multi-zone, or `sensitive-surface` work
   - choose reviewers from the canonical reviewer role set by task context
   - backend slices that touch request-path, persistence, or async runtime behavior must include `staff backend`; add `performance` when the path is user-visible, hot, or can block on storage/network/process work; add `qa/reliability` when retries/timeouts/recovery/duplicate-delivery semantics materially change
   - a worker may not review a slice it authored
   - collect findings into a short report
   - feed in-scope fixes back to the relevant workers without asking for fresh approval each pass
   - if a review finding expands scope, forces redesign, or surfaces a high-risk contradiction, stop and go back to the user for re-approval
   - for non-trivial work, run up to 3 review/fix passes; stop early when review is clean; findings are blockers unless explicitly waived
   - `sensitive-surface` slices are not clean until the scanner is clean or explicitly dispositioned, and the relevant reviewer states either a concrete risk or that the approved slice is clean within scope
   - if blockers remain after the max passes, stop as blocked and surface unresolved findings
7. Stop when acceptance criteria are met; do not widen scope mid-flight.
8. Append to the knowledge base only when the task produced a durable fact, lesson, or open question.

## Canonical roles

Implementers:
- `backend`
- `frontend`

Reviewers:
- `critic`
- `staff backend`
- `staff frontend`
- `frontend taste`
- `security`
- `privacy/data-safety`
- `qa/reliability`
- `performance`

Notes:
- Reviewer labels are separate from implementer labels and may not be reused as implementer ownership labels.
- Use only the roles actually needed for the current slice.
- `qa/reliability` is one combined reviewer slot at this top level.

## Rules

- Do not let two agents edit the same file zone.
- Do not mix auth, UI, importer, security, and privacy/data-retention changes in one slice.
- Do not treat backend request-shape or persistence changes as implementation-only details; contract and docs impact must be checked before approval and before closing review.
- Keep the critic separate from implementers.
- If a slice touches local files, personal docs, prompts/examples, logs/traces, retained user data, or machine-specific paths, treat it as `sensitive-surface` until proven otherwise.
- Do not commit real user documents, machine-specific paths, or retained private data into repo-visible `references/`, `assets/`, examples, fixtures, or logs.
- If the task is ambiguous, clarify the contract before starting.
- Before approval, only discovery / proposal work is allowed.
- Before approval, do not spawn implementer workers, do not start implementation runs, do not prepare patches, and do not edit files.
- Critique should not redo discovery or start a new repo tour unless a concrete contradiction or missing evidence forces it.
- After approval, critic may challenge blockers, contradictions, missing verification, and unjustified complexity, but may not reopen scope or push structural change unless a blocker or high-risk contradiction forces it.
- Never paste raw worker responses into chat unless the user explicitly asks for them.
- For tiny, obvious fixes, keep the workflow minimal, but still route implementation through a worker instead of doing it manually yourself.

## Knowledge base

Read when relevant; for tiny isolated fixes, skip or minimize KB reads.

Update the relevant file only when the work produced a durable fact, lesson, or open question. Keep entries short, append-only, and task-specific. If a file gets noisy, compact it into a few bullets and move older detail into an archive note.

## Helper

Use [scripts/record_knowledge.py](scripts/record_knowledge.py) to append a fact, lesson, or open question.
