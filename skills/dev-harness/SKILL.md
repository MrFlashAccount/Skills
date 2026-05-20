---
name: dev-harness
description: Orchestrate software work through execution planning and high-level delegation after research has produced a human-approved research packet. In the repo's flow, this is primarily the `execution plan` stage, consuming a research wrapper packet after explicit human approval and, when architecture-sensitive, an Architect-owned structural contract, then producing an implementation contract. Use when planning or delegating implementation/refactor tasks, especially multi-file, risky, or sliceable work, or when durable learnings should be captured.
---

# Dev Harness

Use as the top-level execution-planning harness. It turns a human-approved research packet, plus Architect-owned structural contract when needed, into an implementation contract and then routes the approved contract onward.

Default chain:

`research-critic -> user approval -> optional Architect A/B structural contract -> Planner A/B execution contract -> implementation-harness -> code-review-orchestrator`

Keep path small. Use the full harness only when needed.

## When to use

- Use for one-file fixes too; keep the plan compact.
- Use the full harness for multi-file, multi-domain, risky, ownership-unclear, or architecture-sensitive work.
- If the task is vague, finish research, show the research review packet to the user, and get explicit approval before Architect or execution planning.

## Read order

Read only the references needed for the current phase; do not load every role by default.

- Before execution planning for non-trivial or ownership-unclear work, read [references/task-contract.md](references/task-contract.md).
- If the slice may touch local files, personal docs, prompts/examples, logs, retained user data, or machine-specific paths, read [references/sensitive-surfaces.md](references/sensitive-surfaces.md) before proposal.
- For architecture-sensitive work, or any slice where durable architecture artifacts might be required, read [references/roles/architect-planning.md](references/roles/architect-planning.md).
- Before any delegated Architect, implementer, or reviewer worker is spawned, include the applicable phase overlay/load block from [references/roles/architect-planning.md](references/roles/architect-planning.md), [references/roles/implementers.md](references/roles/implementers.md), or [references/roles/reviewers.md](references/roles/reviewers.md). A role label alone is not a role contract; the worker must directly load the selected role's `ROLE.md` and `RUBRIC.md`, then follow those loaded role files for any additional references. Planner A/B is a task-contract phase, not a canonical role; delegated Planner prompts must include the applicable section from [references/task-contract.md](references/task-contract.md) and return explicit planner contract evidence.
- After approval, hand off to `../implementation-harness/` with the approved task context, human-approved research packet, structural contract when present, and approved execution-plan packet.
- If routing is ambiguous or you want a sanity check on expected worker/reviewer choice, read [references/examples.md](references/examples.md).
- Read the knowledge base only when relevant:
  - [references/knowledge/facts.md](references/knowledge/facts.md)
  - [references/knowledge/lessons.md](references/knowledge/lessons.md)
  - [references/knowledge/open-questions.md](references/knowledge/open-questions.md)

## Delegated Role Load Contract

Before spawning any role-owned worker/subagent for Architect, implementer, or reviewer work, the parent/orchestrator must embed the applicable phase overlay plus this load block in the worker prompt.

Role label alone is invalid. The worker must:
- load the selected canonical role `ROLE.md` and `RUBRIC.md` directly before judging, planning, editing, or reviewing;
- follow those loaded role files for any additional references, learnings, or project-local read requirements;
- return `role_files_loaded` listing exact paths loaded, including `ROLE.md`, `RUBRIC.md`, and any additional files loaded because the role instructed it;
- return `blocked` instead of a verdict/output if required role loading cannot be completed.

Parent acceptance rule: do not accept a required Architect, implementer, or reviewer gate when `role_files_loaded` is absent, incomplete, or mismatched to the selected role. Mark that gate `blocked` and fix the delegation prompt or rerun the gate. Do not use this role-load evidence rule for Planner A/B; Planner is governed by the task-contract phase evidence.

## Task class

- `tiny`: obvious, narrow, low-risk, usually one file / one intent.
- `non-trivial`: risky, ambiguous, multi-zone, user-facing, security-sensitive, privacy/data-sensitive, architecture-sensitive, or easy to get subtly wrong.
- If unsure, treat the task as `non-trivial`.

## Execution planning contract

Execution planning must be concrete enough to determine implementation shape, ownership, verification, and rollback. It must not become code or patch planning.

The required execution contract starts from [references/task-contract.md](references/task-contract.md) and must include implementation entities when work is non-trivial or multi-surface.

For new project, new repo, new plugin, and architecture-sensitive work, the contract must also carry a `project_baseline` and an architecture artifact manifest. These record the existing project docs, meaningful source ownership zones, and required/deferred architecture or design artifacts before implementation is handed off.

Implementation entity kinds may include:

- `module`
- `class`
- `function`
- `component`
- `config_key`
- `schema`
- `adapter`
- `route`
- `command`
- `doc_artifact`
- `contract_surface`
- `migration`

Each implementation entity should cover:

- `kind`
- `name`
- `responsibility`
- `inputs`
- `outputs`
- `integration_point`
- `file_zone`
- `verification_surface`
- `rollback_surface`
- `source_or_evidence`

Implementation entities are planner-level handoff objects. They are not Researcher domain vocabulary and not Architect structural entities.

## Workflow

1. Read existing task context and relevant knowledge base.
2. If a human-approved research packet does not exist yet, route or perform the `research` stage first.
   - default reusable path: `research-critic`
   - do not let execution planning absorb broad discovery/proposal work
3. For non-trivial work, show the research review packet to the user and wait for explicit approval before starting Architect or execution planning.
   - the research wrapper verdict is not self-approving
   - `approve_with_changes` is not ready for this gate until required changes are folded back into the Researcher packet
4. Run the architecture gate before planning:
   - If the task is to create, revise, or ship a full architecture process/package, route through `create-architecture`; do not replace that workflow with the internal DevHarness Architect gate.
   - For architecture-sensitive scope, run `Architect A -> Architect B attack -> one bounded revise/re-review loop` using [references/roles/architect-planning.md](references/roles/architect-planning.md) and produce the structural contract before execution planning unless the caller explicitly approves another loop.
   - For non-trivial work, explicitly decide whether architecture-sensitive scope or durable architecture artifact pressure exists. If not, record architecture artifact decision `none` and proceed without a structural contract.
   - For tiny work, run this gate only when ownership, seams, dependency direction, structural records, or durable architecture artifacts might move.
   - If an artifact decision is `update_existing` or `create_new`, Architect owns that create/update decision before implementation handoff by default.
5. Build the execution plan.
   - `Planner A propose`: translate the human-approved research packet and structural contract when present into the execution contract.
   - `Planner B attack`: challenge entity coverage, file-zone ownership, project baseline coverage, architecture artifact manifest, verification surfaces, rollback surfaces, sensitive surfaces, request-path/contract touchpoints, risks, proposal-workspace hygiene, and max-detail leaks.
   - Allow one bounded revise/re-review loop for non-trivial work when the attack finds fixable gaps, unless the caller explicitly approves another.
   - Keep this as the same planner role/class in an attack pass, not a new separate role.
6. Show one cleaned execution plan before coding.
7. Stop after the execution plan until explicit approval.
   - approval means explicit `APPROVED`, `LGTM`, or the same level of unmistakable go-ahead in the user's language
   - `ok`, `yeah`, `got it`, and similar weak acknowledgements are not approval
8. After approval, build the handoff packet for `implementation-harness`.
   - include approved task context, human-approved research packet, structural contract when present, approved execution plan, evidence that still matters to implementation, and user constraints
   - spawn implementation through delegated worker/subagent via `implementation-harness`; do not implement in the orchestrator session unless the user explicitly requested direct in-session execution
   - if delegated execution is unavailable, fails to start, or cannot be used, stop as `blocked`
9. `implementation-harness` owns post-approval development and smallest meaningful verification.
10. `code-review-orchestrator` owns the explicit post-implementation review gate and fix/re-review loop, including contract/docs drift checks when contract-bearing surfaces changed.
11. If development or review finds scope growth, redesign pressure, or a high-risk contradiction, return for re-approval.
12. Append to the knowledge base only when the task produced a durable fact, lesson, or open question.

## Planning guardrails

Before approval, execution plans may include:

- goal and non-goals
- file zones and implementer owners
- implementation entities at planner granularity
- reviewer roles and reviewer plan
- acceptance criteria
- verification surfaces
- rollback surfaces
- project baseline and architecture artifact manifest
- proposal-workspace decision and publish/PR hygiene constraints
- sensitive-surface handling
- request-path / contract touchpoints
- docs to update
- contract/docs drift surfaces and final-review inputs, including expected docs/tests/source-contract artifacts when contract-bearing surfaces may change
- code-documentation surfaces to update when the slice changes public, contract-bearing, or non-trivial code
- risks and assumptions
- architecture artifact decision and structural contract reference when present

Before approval, execution plans must not include:

- code blocks
- pseudocode
- algorithms
- exact signatures
- exact class/function skeletons
- edit recipes
- patch-like diffs
- file-by-file instructions that read as a ready patch
- command sequences for implementation
- SQL/migration bodies
- generated configs or source snippets

## Rules

- Research must be a human-approved research packet before Architect or execution planning starts for non-trivial work: wrapper `approve_as_is`, or `approve_with_changes` only after required changes are folded back in, must still be shown to the user for explicit approval.
- Architecture-sensitive implementation scope must pass through Architect before execution planning.
- Full architecture process/package work must route through `create-architecture`; DevHarness's internal Architect gate is only the planning-time structural contract for an implementation slice.
- Do not create parallel architecture ceremony: use [references/roles/architect-planning.md](references/roles/architect-planning.md) for the existing planning-time architecture gate, or `create-architecture` for a full architecture package.
- Execution planning owns implementation entities; Architect owns structural entities; Researcher owns domain vocabulary and known facts/evidence.
- One agent per file zone.
- Code implementer owners must use only `backend` or `frontend` as the role label. Architecture artifact implementation may use `architect` only for approved architecture artifacts such as `ARCHITECTURE.md`, meaningful source-zone `CONTEXT.md`, and ADR/migration docs; this is distinct from architect review and must not own backend/frontend code.
- Do not let two agents edit the same file zone.
- For new project, new repo, new plugin, and architecture-sensitive work, include `project_baseline` and an architecture artifact manifest in the execution contract before implementation handoff.
- For UI/frontend surfaces, the project baseline must say whether repo `DESIGN.md` exists, is required, or is explicitly out of scope/deferred; DevHarness does not silently run a project scaffold or design-memory scaffold.
- Source-focused `CONTEXT.md` defaults only to meaningful source ownership zones. Do not create folder-level context docs for tests, scripts, fixtures, or tooling by default unless they have real ownership or dependency rules.
- `.proposals/` is opt-in only by explicit Sergey/user request. If created, use `.proposals/<feature-slug>/{research.md,architecture.md,implementation.md}`, ensure it is gitignored in the target repo, treat it as non-final workspace, and fail publish/PR hygiene on root `plan.md`, `architecture-proposal.md`, `implementation-proposal.md`, or other implementation proposal leftovers unless explicitly approved.
- Do not mix auth, UI, importer, security, and privacy/data-retention changes in one slice.
- Do not treat backend request-shape, persistence, or async runtime changes as implementation-only details; contract and docs impact must be checked before approval and before review closes.
- Docs-to-update and contract touchpoints are final-review inputs, not only planning fields; contract/docs impact must be reconciled in final Architect review before closure when contract-bearing surfaces changed.
- Do not assume external integration contracts from happy-path mocks or one narrow sample; review must name the contract evidence source when such assumptions matter.
- If the slice touches local files, personal docs, prompts/examples, logs/traces, retained user data, or machine-specific paths, treat it as `sensitive-surface` until proven otherwise.
- Do not commit real user documents, machine-specific paths, or retained private data into repo-visible `references/`, `assets/`, examples, fixtures, or logs.
- Before approval, do not spawn implementer workers, do not start implementation runs, do not prepare patches, and do not edit files.
- For tiny, obvious fixes, keep the workflow minimal, but still route approved implementation through `implementation-harness` instead of doing it manually yourself.
- Plain user action verbs like `fix`, `do`, `сделай`, or `исправь` do not count as permission for direct parent-session implementation; only an explicit request for direct in-session execution overrides the orchestrator default.
- Speed is not a reason to bypass worker/subagent execution. If the workflow applies, keep the orchestrator in orchestration mode.
- If required delegated execution is unavailable, fails to start, or cannot be used, stop as `blocked` rather than implementing or reviewing manually in the parent session.
- Delegated Architect, implementer, or reviewer prompts must require `role_files_loaded` listing loaded `ROLE.md`, `RUBRIC.md`, and any additional files loaded because the role itself instructed it, or `blocked` if required role loading could not be completed. Do not accept delegated role-owned output for a required gate when that evidence is absent or wrong. Delegated Planner prompts must instead include the relevant task-contract section and return planner contract evidence.

## Knowledge base

Read when relevant; for tiny isolated fixes, skip or minimize KB reads.

Update the relevant file only when the work produced a durable fact, lesson, or open question. Keep entries short, append-only, and task-specific. If a file gets noisy, compact it into a few bullets and move older detail into an archive note.

## Global helpers

Helpers live under this skill root and are meant to run against any target repo without being copied into that repo.

- Resolve helper paths relative to the loaded `SKILL.md`, not relative to the target repo or current shell directory.
- Helpers must accept an explicit repo path, default safely to the current working directory, and avoid writing to the inspected repo unless their purpose requires it.
- Helpers should emit stable, machine-readable output that can be included in handoff or review briefs.
- For sensitive-surface checks, run `python3 <dev-harness-skill-root>/scripts/check_sensitive_surface.py [<repo-path>] [--base <rev>]`.
- Use `--strict` only when a nonzero exit is useful for automation; the default mode is report-only so reviewers can disposition findings.

## Helper

Use [scripts/record_knowledge.py](scripts/record_knowledge.py) to append a fact, lesson, or open question.
