# Skills

Editable source repo for OpenClaw skills, reusable roles, shared reference packages, and conventions.

Use this repo when you want to:
- find the right skill for a task
- update how a skill behaves at runtime
- reuse a role instead of copying role prose into a skill
- reuse reference material that should not be an active skill
- keep shared repo conventions in one place

Local OpenClaw reads skills directly from this repo's `SKILL.md` files, so packaged `.skill` bundles are not needed for normal local use.

## Table of contents

- [Start here](#start-here)
- [How this repo works](#how-this-repo-works)
- [Repo map](#repo-map)
- [Common workflows](#common-workflows)
- [Skill index](#skill-index)
- [Shared reference packages](#shared-reference-packages)
- [Role index](#role-index)
- [Process docs](#process-docs)
- [Conventions](#conventions)
- [Repo rules](#repo-rules)

## Start here

If you need...
- a runnable skill -> go to [`skills/`](#skill-index)
- reusable reference material that is not a runnable skill -> go to [`shared/`](#shared-reference-packages)
- a reusable reviewer/writer/specialist role -> go to [`roles/`](#role-index)
- a repo-level shared rule or memory convention -> go to [`conventions/`](#conventions)
- to create or rewrite a skill -> start with [`skills/create-skill`](#skill-index)

## How this repo works

Think of the repo in four layers:

1. `skills/` — executable skill source
   - each skill lives in its own folder
   - runtime entrypoint is `skills/<name>/SKILL.md`
   - references, scripts, and assets live beside it

2. `roles/` — reusable role contracts
   - these are not runnable skills
   - they hold canonical specialist identity, rubric, and learnings
   - skills should load and adapt them instead of re-owning the same role prose

3. `conventions/` — repo-level defaults
   - shared conventions that multiple roles or skills may reference
   - use these when the rule is broader than one skill but narrower than general repo docs

4. `shared/` — reusable reference packages
   - these are not runnable skills
   - use them for cross-skill contracts, snippets, or authoring references that should stay out of the active skill catalog

## Repo map

```text
skills/         runnable skill folders
roles/          reusable role contracts
shared/         reusable reference packages, not runtime skills
conventions/    shared repo-level conventions
SPDD-lite.md    lightweight process doc
README.md       onboarding + repo map
```

Canonical shapes:

### Skill folder

```text
skills/<skill-name>/
  SKILL.md
  references/
  scripts/      # optional
  assets/       # optional
```

### Role folder

```text
roles/<Role-Name>/
  ROLE.md
  RUBRIC.md
  LEARNINGS.md
```

### Shared package folder

```text
shared/<package-name>/
  README.md
  *.md          # reference material and snippets
```

When a canonical label and folder path differ, the folder path is the source of truth.
Current non-trivial mappings:
- `frontend taste` -> `roles/frontend-taste`
- `privacy/data-safety` -> `roles/privacy-data-safety`
- `qa/reliability` -> `roles/qa-reliability`

## Common workflows

### Find the right skill

- developer-facing README intros, technical launch framing, developer-facing product positioning -> `skills/devrel-copywriter`
- docs, setup, usage, onboarding, API explanation -> `skills/docs-writer`
- market-facing copy, copy refreshes, content planning, launch planning, pricing/packaging, sales collateral, competitor dossiers, customer research, cold outreach, or lifecycle email -> `roles/marketing` (start at `roles/marketing/ROLE.md` and follow the role's own task-type routing table)
- create or refactor a skill -> `skills/create-skill`
- planning + slice + approval flow for code work -> `skills/dev-harness`
- multi-role review -> `skills/code-review-orchestrator`
- pre-implementation Researcher -> Critic research verdict -> `skills/research-critic`

### Reuse a role

If a skill needs a reusable specialist voice:
- load from `roles/`
- in skill runtime instructions, resolve paths relative to the skill root (`skills/<name>/`), not relative to nested reference files
- for repo-level shared roles/conventions from a skill, use paths like `../../roles/<role>/...` or `../../conventions/<file>.md`
- for sibling skills from a skill, use paths like `../<skill-name>/...`; reserve `skills/<skill-name>/...` for repo-map prose, not runtime load paths
- adapt it to the current phase
- keep role identity in `roles/`, not in local copied prose

### Reuse a shared reference package

If a skill needs reusable instructions that are not a runnable skill:
- load or link the package under `shared/`
- keep runtime entrypoints out of shared packages; shared packages must not include `SKILL.md`
- from a skill, reference shared material with skill-root-relative paths like `../../shared/<package>/README.md`
- copy only the needed snippet or contract into the consuming skill when runtime loading must stay self-contained

### Add or update a skill

1. Start from concrete usage, not abstract theory.
2. Use `skills/create-skill` when building or rewriting the skill.
3. Keep `SKILL.md` lean.
4. Push bulky or variant-specific detail into `references/`.
5. Add scripts only for deterministic repeated work.
6. Test with representative prompts before calling it done.

## Skill index

### Writing and docs

- `skills/devrel-copywriter`
  - What it is: developer-facing framing, positioning, launch copy, README intros, and messaging polish.
  - Use when: the main job is message hierarchy, payoff, tone, and believable product framing.
  - Do not use when: the main job is teaching setup, usage, onboarding, migration, or API behavior.

- `skills/docs-writer`
  - What it is: documentation writing and rewriting for usage, setup, onboarding, migration, and API/reference clarity.
  - Use when: the main job is reader success through clear explanation and structure.
  - Do not use when: the main job is framing, positioning, or README opening copy.

- `skills/cover-letter-writer`
  - What it is: tailored cover letter creation from job context and resume material.
  - Use when: the task is job-specific cover-letter drafting.
  - Do not use when: the task is general docs or product copy.

- `skills/humanizer`
  - What it is: cleanup pass for tone, rhythm, and less robotic wording.
  - Use when: wording is technically fine but reads too AI-ish or stiff.
  - Do not use when: the real problem is strategy, structure, or missing facts.

- `skills/forthright`
  - What it is: compression/editing pass that cuts fluff without hiding the point.
  - Use when: text is bloated and needs sharper wording.
  - Do not use when: the real issue is missing structure or unclear task intent.

- `skills/caveman`
  - What it is: ultra-compressed reply mode.
  - Use when: the user wants short, blunt, token-efficient output.
  - Do not use when: the reply needs nuance, safety wording, or normal tone.

### Marketing and go-to-market

- `roles/marketing`
  - What it is: the self-contained Marketing role for market-facing work.
  - Start at: `roles/marketing/ROLE.md`
  - Use when: the task is copywriting, copy editing, content strategy, launch planning, pricing/packaging, sales collateral, competitor profiling, customer research, cold outreach, or lifecycle email.
  - Do not use when: the main job is developer-facing README/docs/adoption/trust work; keep that in `skills/devrel-copywriter` or `skills/docs-writer`.
  - Routing: follow the Marketing role's own task-type routing table.

### Planning, review, and implementation flow

- `skills/create-skill`
  - What it is: execution harness for building or rewriting a skill folder.
  - Use when: a skill shape is already scoped and should be implemented cleanly.
  - Do not use when: scope is still fuzzy.

- `skills/dev-harness`
  - What it is: top-level execution-planning harness that turns closed research into an approved implementation contract and routes the work onward.
  - Use when: the task needs planning, slicing, approval flow, delegation, or coordinated handoff after research is already closed enough.
  - Do not use when: the task still needs broad research/discovery, or when scope is already approved and closed for direct implementation or review.

- `skills/implementation-harness`
  - What it is: direct implementation harness for already-approved work.
  - Use when: scope is locked and the main job is execution.
  - Do not use when: the task still needs discovery or approval shaping.

- `skills/loop`
  - What it is: generic agent-agnostic loop router for bounded repeated task cycles with state baton, one-cycle executors, progress reporting, and explicit stop rules.
  - Use when: a task should run through repeated independent cycles, such as bug hunts, docs cleanup passes, PR comment handling, or quality-gated review/fix loops.
  - Do not use when: the task only needs a one-shot answer, continuation criteria are missing, or another cycle would bypass required approval, safety, or external-action gates.

- `skills/code-review-orchestrator`
  - What it is: one entrypoint for multi-role code review with merged findings.
  - Use when: the user wants a repo, diff, branch, or PR reviewed from one or more specialist angles.
  - Do not use when: the main job is pre-implementation planning or direct implementation.

- `skills/research-critic`
  - What it is: reusable pre-implementation Researcher -> Critic workflow that returns a final research verdict.
  - Use when: a task needs context closure, assumption pressure, readiness judgment, or structured research before downstream ownership.
  - Do not use when: implementation, Architect-owned structural scoping, or PR review should already be happening.

- `skills/grill-me`
  - What it is: scoping/interrogation helper for unclear tasks.
  - Use when: the real problem is still figuring out what should be built.
  - Do not use when: the work is already scoped enough for `create-skill` or implementation.

### Frontend and architecture specialties

React/Next.js best-practice guidance now lives under `roles/frontend/references/react-ui-patterns.md` and is loaded through the `frontend` role rather than a standalone skill.

- `skills/improve-codebase-architecture`
  - What it is: architecture improvement guidance and artifacts.
  - Use when: the task is reorganizing structure, boundaries, or architecture records.
  - Do not use when: the task is a tiny local fix with no architecture effect.

### Workflow and repo utilities

- `skills/github-ticket-intake`
  - What it is: intake structure for GitHub issue work.
  - Use when: the task is turning issue context into actionable scoped work.
  - Do not use when: the task is generic writing or implementation already in flight.

- `skills/obsidian`
  - What it is: Obsidian-oriented workflow support.
  - Use when: the task touches Obsidian notes/workflows.
  - Do not use when: the task has nothing to do with that environment.

## Shared reference packages

Shared packages are reference material for skill authors and workflow skills. They are discoverable from this README but intentionally excluded from the active skill catalog because they do not contain `SKILL.md` entrypoints.

- `shared/delegate`
  - What it is: reusable delegation-mode principles, worker contract, and inclusion snippets for skills that orchestrate workers or subagents.
  - Use when: a skill needs to describe delegation behavior, worker handoff constraints, merged reporting, timeouts, or approval boundaries without depending on an active `delegate` skill.
  - Do not use when: the user is only asking to toggle a runtime delegation mode; there is no installable `delegate` skill in this repo.

- `shared/go-to-market-context`
  - What it is: reusable GTM/product messaging foundation covering product overview, audience, JTBD, pains, alternatives, differentiation, objections, proof points, messaging hierarchy, constraints, and open questions.
  - Use when: a role or skill needs shared product/audience/messaging context before doing positioning, launch framing, campaign work, or developer-facing framing.
  - Do not use when: the task only needs a standalone workflow or artifact-specific execution with no shared context dependency.

## Role index

Roles are reusable references, not executable skills.
Use them when a skill needs a stable specialist identity across phases.

- `roles/architect`
  - Architecture fit, boundaries, seams, DDD alignment, record updates.
- `roles/backend`
  - Backend/server implementation and review judgment.
- `roles/critic`
  - Adversarial pressure on assumptions, scope, risk, and complexity.
- `roles/dev-rel`
  - Developer-facing framing, positioning, and messaging quality.
- `roles/marketing`
  - Marketing positioning, messaging, ICP/personas, launch/campaign framing, and objection handling.
- `roles/frontend`
  - Frontend/client implementation and review judgment.
- `roles/frontend-taste`
  - Rendered UI taste, hierarchy, spacing, typography, composition, and polish, with routed learnings by project type.
- `roles/performance`
  - Hot-path, latency, throughput, blocking work, and resource impact.
- `roles/privacy-data-safety`
  - Local-path leakage, repo-visible private content, retention, and consent safety.
- `roles/qa-reliability`
  - Failure handling, rollback/recovery, degraded mode, diagnosability, and test signal.
- `roles/researcher`
  - Research packet building, context closure, ambiguity cleanup, and readiness preparation before critique and downstream ownership.
- `roles/security`
  - Exploitability, auth, injection, secrets, and trust-boundary review.
- `roles/tech-writer`
  - Teaching-oriented technical documentation writing and review.

## Process docs

- `SPDD-lite.md`
  - What it is: lightweight four-stage repo process doc: `research -> execution plan -> development -> review`.
  - Use when: you need the house workflow and stage boundaries for structured skill work.
  - Do not use when: you only need a single skill folder and its own local instructions.

## Conventions

- `conventions/repo-architecture-memory.md`
  - What it is: repo-level convention for architecture memory in target repos.
  - Use when: a role or skill needs a default rule for context docs, ADRs, context maps, or similar artifacts.
  - Do not use when: the task only needs one role's local judgment with no shared memory convention.

- `conventions/repo-design-memory.md`
  - What it is: repo-level convention for design memory in target repos, with a short `DESIGN.md` router and downstream design-law files.
  - Use when: a role or skill needs stable repo-local design law instead of generic taste judgment.
  - Do not use when: the task only needs portable taste heuristics with no repo-specific design source of truth.

## Repo rules

- Keep `skills/` as the source of truth for skill runtime behavior.
- Keep `shared/` as the source of truth for reusable reference packages that must not be active runtime skills.
- Keep `roles/` as the source of truth for reusable role references.
- Keep `conventions/` as the source of truth for repo-level reusable conventions.
- Prefer loading/adapting roles from `roles/` over copying role prose into skills.
- Prefer referencing `conventions/` over inventing duplicated repo-wide wording inside one skill.
- Do not add extra docs inside a skill folder unless they are part of runtime behavior.
- Do not copy repo/editor docs into a skill unless that content is actually needed at runtime.
