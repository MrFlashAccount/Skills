---
name: dev-harness
description: Orchestrate software work through discovery, proposal, approval, and high-level delegation, with implementation routed to implementation-harness after approval. Use when planning or delegating implementation/refactor tasks, especially multi-file, risky, or sliceable work, or when durable learnings should be captured.
---

# Dev Harness

Use as the top-level coding harness. You orchestrate discovery, proposal, approval, and high-level delegation. After approval, hand the approved task context plus research packet to `implementation-harness`; that skill owns implementation, verification, and review/fix passes. Under this skill, the orchestrator does not directly implement the approved slice.

Keep path small. Use the full harness only when needed.

## When to use

- Use for one-file fixes too; keep the path minimal.
- Use the full harness for multi-file, multi-domain, or risky work.
- If the task is vague, write the contract first.

## Read order

Read only the references needed for the current phase; do not load every role by default.

- Before proposal for non-trivial or ownership-unclear work, read [references/task-contract.md](references/task-contract.md).
- If the slice may touch local files, personal docs, prompts/examples, logs, retained user data, or machine-specific paths, read [references/sensitive-surfaces.md](references/sensitive-surfaces.md) before proposal.
- After approval, hand off to `skills/implementation-harness/` with the approved task context plus research packet; do not restate or re-run its detailed implementation/review workflow here.
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
   - approval means an explicit `APPROVED` or `LGTM`, or the same level of unmistakable go-ahead in the user's language; `ok`, `yeah`, `got it`, and similar weak acknowledgements are not approval
   - before approval, proposals may include goals, risks, and architecture, but not code blocks, pseudocode, function/class skeletons, exact file-by-file edit recipes, command sequences, SQL/migrations, exact signatures, patch-like diffs, or ready-to-apply code
4. After approval, build the handoff packet for `implementation-harness`.
   - include the approved task context, discovered facts, risks, unknowns, candidate file zones, sensitive-surface classification, and any user constraints
   - keep routing at this level minimal: name expected ownership only when needed for clean file-zone boundaries or user-visible delegation clarity
   - if delegated Codex CLI returns auth or `rate_limit` errors, stop and notify the user; do not patch around it by hand
   - send one short status note naming the delegated owner or harness
5. `implementation-harness` owns post-approval implementation, smallest meaningful verification, and review/fix passes.
   - do not duplicate its implementer/reviewer workflow here
   - if that stage finds scope growth, redesign pressure, or a high-risk contradiction, return to the user for re-approval
6. Stop when acceptance criteria are met; do not widen scope mid-flight.
7. Append to the knowledge base only when the task produced a durable fact, lesson, or open question.

## Delegation notes

- Keep one owner per file zone when handing off approved work.
- If zones overlap, collapse to one implementation owner instead of inventing pseudo-slices.
- Keep worker output summarized; do not paste raw subagent transcripts into chat unless the user asks.

## Rules

- Do not let two agents edit the same file zone.
- Do not mix auth, UI, importer, security, and privacy/data-retention changes in one slice.
- Do not treat backend request-shape or persistence changes as implementation-only details; contract and docs impact must be checked before approval and before closing review.
- Do not assume external integration contracts from happy-path mocks or one narrow sample; review must name the contract evidence source when such assumptions matter.
- If a slice touches local files, personal docs, prompts/examples, logs/traces, retained user data, or machine-specific paths, treat it as `sensitive-surface` until proven otherwise.
- Do not commit real user documents, machine-specific paths, or retained private data into repo-visible `references/`, `assets/`, examples, fixtures, or logs.
- If the task is ambiguous, clarify the contract before starting.
- Before approval, only discovery / proposal work is allowed.
- Before approval, do not spawn implementer workers, do not start implementation runs, do not prepare patches, and do not edit files.
- Critique should not redo discovery or start a new repo tour unless a concrete contradiction or missing evidence forces it.
- After approval, route to `implementation-harness` instead of restating implementation/review policy in this skill.
- Never paste raw worker responses into chat unless the user explicitly asks for them.
- For tiny, obvious fixes, keep the workflow minimal, but still route approved implementation through `implementation-harness` instead of doing it manually yourself.

## Knowledge base

Read when relevant; for tiny isolated fixes, skip or minimize KB reads.

Update the relevant file only when the work produced a durable fact, lesson, or open question. Keep entries short, append-only, and task-specific. If a file gets noisy, compact it into a few bullets and move older detail into an archive note.

## Helper

Use [scripts/record_knowledge.py](scripts/record_knowledge.py) to append a fact, lesson, or open question.
