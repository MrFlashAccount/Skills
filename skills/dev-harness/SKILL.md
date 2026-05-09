---
name: dev-harness
description: Orchestrate software work through execution planning and high-level delegation after research is already understood or approved. In the repo's four-stage flow, this is primarily the `execution plan` stage, consuming research output and turning it into an implementation contract. Use when planning or delegating implementation/refactor tasks, especially multi-file, risky, or sliceable work, or when durable learnings should be captured.
---

# Dev Harness

Use as the top-level coding harness for execution planning. You orchestrate the handoff from approved research into an implementation contract and then route the approved contract onward. Reusable proposal/critic work routes through `research-critic`. After approval of the execution plan, hand the approved task context plus closed research packet to `implementation-harness`; that skill owns implementation. Post-implementation review should run through `code-review-orchestrator`. Under this skill, the orchestrator does not directly implement the approved slice.

Keep path small. Use the full harness only when needed.

## When to use

- Use for one-file fixes too; keep the path minimal.
- Use the full harness for multi-file, multi-domain, or risky work.
- If the task is vague, write the contract first.

## Read order

Read only the references needed for the current phase; do not load every role by default.

- Before execution planning for non-trivial or ownership-unclear work, read [references/task-contract.md](references/task-contract.md).
- If the slice may touch local files, personal docs, prompts/examples, logs, retained user data, or machine-specific paths, read [references/sensitive-surfaces.md](references/sensitive-surfaces.md) before proposal.
- After approval, hand off to `skills/implementation-harness/` with the approved task context plus closed research packet; do not restate or re-run its detailed implementation/review workflow here.
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
2. If research is not already closed, route or perform the `research` stage first.
   - default reusable path: `research-critic`
   - do not let execution planning silently absorb broad discovery/proposal work when a real research stage is still missing
3. Execution-plan contract: after research is closed enough, translate it into an implementation contract.
   - default to one read-only discovery worker; use more only for multi-zone or non-trivial inspection
   - planning-time inspection may inspect, search, summarize, map candidate file zones, and identify risks/unknowns still relevant to execution boundaries
   - planning-time inspection is facts-first: no new broad proposal, no edit plans, no architecture nudges, no code-ish artifacts
   - every material claim should be evidence-backed with file/line/symbol when practical; otherwise mark it as an assumption or unknown
   - use safe reads/searches only; no edits, no patches, and no builds/tests/scripts unless explicitly required for inspection
   - stop when there are enough facts for execution planning, or when remaining gaps prove research is not actually closed; do not keep touring the repo
   - execution-plan output shape starts from the task contract: `Goal / Non-goals / File zones / Implementer owners / Reviewer / Acceptance criteria / Design-test status / Rollback / Risks`
   - if the slice is or might be `sensitive-surface`, extend the contract with: `Sensitive inputs / Persistence / Exposure surface / Reviewer plan`
   - if the slice touches backend request-path, persistence, or async runtime behavior, also name: `Request-path impact / Contract touchpoints / Docs-to-update`
   - classify as `sensitive-surface` by default when the slice touches any of: local files, personal docs, `references/`, `assets/`, prompts/examples, logs/traces, retained user data, external sends, or machine-specific paths
   - show one cleaned execution plan to the user before coding
   - this gate is mandatory for every code task, even tiny ones
   - after the execution plan, stop; continue only after explicit approval
   - approval means an explicit `APPROVED` or `LGTM`, or the same level of unmistakable go-ahead in the user's language; `ok`, `yeah`, `got it`, and similar weak acknowledgements are not approval
   - before approval, execution plans may include ownership, zones, reviewer plan, risks, and contract boundaries, but not code blocks, pseudocode, function/class skeletons, exact file-by-file edit recipes, command sequences, SQL/migrations, exact signatures, patch-like diffs, or ready-to-apply code
   - research must be closed before execution planning is treated as approved; unresolved implementation-critical gaps stay in research instead of leaking into development
4. After approval, build the handoff packet for `implementation-harness`.
   - include the approved task context, discovered facts, evidence, risks, unresolved blockers, candidate file zones, sensitive-surface classification, and any user constraints
   - keep routing at this level minimal: name expected ownership only when needed for clean file-zone boundaries or user-visible delegation clarity
   - if delegated Codex CLI returns auth or rate_limit errors, stop and notify the user; do not patch around it by hand
   - send one short status note naming the delegated owner or harness
5. `implementation-harness` owns post-approval development and smallest meaningful verification.
6. `code-review-orchestrator` owns the explicit post-implementation review gate and any review/fix/re-review loop needed to clear the approved contract.
7. If development or review finds scope growth, redesign pressure, or a high-risk contradiction, return to the user for re-approval.
8. Stop when acceptance criteria are met; do not widen scope mid-flight.
9. Append to the knowledge base only when the task produced a durable fact, lesson, or open question.

## Rules

- Do not let two agents edit the same file zone.
- Do not mix auth, UI, importer, security, and privacy/data-retention changes in one slice.
- Do not treat backend request-shape or persistence changes as implementation-only details; contract and docs impact must be checked before approval and before closing review.
- Do not assume external integration contracts from happy-path mocks or one narrow sample; review must name the contract evidence source when such assumptions matter.
- Keep the critic separate from implementers.
- If a slice touches local files, personal docs, prompts/examples, logs/traces, retained user data, or machine-specific paths, treat it as `sensitive-surface` until proven otherwise.
- Do not commit real user documents, machine-specific paths, or retained private data into repo-visible `references/`, `assets/`, examples, fixtures, or logs.
- If the task is ambiguous, clarify the contract before starting.
- Before approval, only research handoff completion and execution-planning work are allowed.
- Before approval, do not spawn implementer workers, do not start implementation runs, do not prepare patches, and do not edit files.
- Critique should not redo discovery or start a new repo tour unless a concrete contradiction or missing evidence forces it.
- After approval, route to `implementation-harness` for development and `code-review-orchestrator` for explicit review instead of restating those policies in this skill.
- Do not treat implementer self-report as enough to close non-trivial coding work; validation plus independent review decide completion.
- Never paste raw worker responses into chat unless the user explicitly asks for them.
- For tiny, obvious fixes, keep the workflow minimal, but still route approved implementation through `implementation-harness` instead of doing it manually yourself.

## Knowledge base

Read when relevant; for tiny isolated fixes, skip or minimize KB reads.

Update the relevant file only when the work produced a durable fact, lesson, or open question. Keep entries short, append-only, and task-specific. If a file gets noisy, compact it into a few bullets and move older detail into an archive note.

## Global helpers

Helpers live under this skill root and are meant to run against any target repo without being copied into that repo.

- Resolve helper paths relative to the loaded `dev-harness/SKILL.md`, not relative to the target repo or current shell directory.
- Helpers must accept an explicit repo path, default safely to the current working directory, and avoid writing to the inspected repo unless their purpose requires it.
- Helpers should emit stable, machine-readable output that can be included in handoff or review briefs.
- For sensitive-surface checks, run `python3 <dev-harness-skill-root>/scripts/check_sensitive_surface.py [<repo-path>] [--base <rev>]`.
- Use `--strict` only when a nonzero exit is useful for automation; the default mode is report-only so reviewers can disposition findings.

## Helper

Use [scripts/record_knowledge.py](scripts/record_knowledge.py) to append a fact, lesson, or open question.
