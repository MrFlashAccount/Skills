# Skills

Editable source repo for OpenClaw skills, reusable roles, and shared conventions.

Use this repo when you want to:
- find the right skill for a task
- update how a skill behaves at runtime
- reuse a role instead of copying role prose into a skill
- keep shared repo conventions in one place

Local OpenClaw reads skills directly from this repo's `SKILL.md` files, so packaged `.skill` bundles are not needed for normal local use.

## Table of contents

- [Start here](#start-here)
- [How this repo works](#how-this-repo-works)
- [Repo map](#repo-map)
- [Common workflows](#common-workflows)
- [Skill index](#skill-index)
- [Role index](#role-index)
- [Process docs](#process-docs)
- [Conventions](#conventions)
- [Repo rules](#repo-rules)

Canonical labels do not have to match folder spelling 1:1.
Use the repo folder path as source of truth when loading roles.
Current non-trivial mappings:
- `frontend taste` -> `Roles/Frontend-Taste`
- `privacy/data-safety` -> `Roles/Privacy-Data-Safety`
- `qa/reliability` -> `Roles/QA-Reliability`

- `Roles/Architect`
  - What it is: a phase-agnostic architecture role reference for checking module boundaries, seams, DDD alignment, ubiquitous language, and architecture fit.
  - Use when: a skill needs architectural judgment during research, review, or while defining architectural constraints.
  - Do not use when: the task is a tiny local fix with no meaningful effect on module shape, naming, ownership, or architecture records.
- `Roles/Critic`
  - What it is: a phase-agnostic challenge role reference for pressure-testing proposals and results for weak assumptions, hidden risk, scope creep, and unnecessary complexity.
  - Use when: a skill needs adversarial critique during research, approval, or frozen-scope review.
  - Do not use when: the task mainly needs a specialist correctness review such as backend, frontend, security, privacy/data-safety, QA, performance, or architecture judgment.
- `Roles/Backend`
  - What it is: a phase-agnostic backend role reference for server-side implementation and review judgment across contracts, validation, data flow, auth, rollout safety, and observability/testability.
  - Use when: a skill needs backend/server ownership or backend correctness review without splitting identity into backend vs staff-backend variants.
  - Do not use when: the task is primarily frontend, visual-quality, or non-backend specialist work.
- `Roles/Frontend`
  - What it is: a phase-agnostic frontend role reference for client-side implementation and review judgment across contract consumption, state/data flow, loading/error states, routing/hydration, and maintainability.
  - Use when: a skill needs frontend/client ownership or frontend correctness review without splitting identity into frontend vs staff-frontend variants.
  - Do not use when: the task is mainly visual-polish review, which belongs to `frontend taste`, or non-frontend specialist work.
- `Roles/Frontend-Taste`
  - What it is: a phase-agnostic rendered-UI taste role reference for hierarchy, spacing, typography, composition, and polish review.
  - Use when: a skill needs screen-level presentation-quality judgment for an approved UI slice.
  - Do not use when: the task mainly needs frontend/client correctness rather than visual-quality review.
- `Roles/Security`
  - What it is: a phase-agnostic security role reference for exploitability, secrets, auth, injection, and trust-boundary review.
  - Use when: a skill needs security review where exploitability or trust-boundary regression is the primary concern.
  - Do not use when: the task mainly concerns privacy/data-retention handling rather than security risk.
- `Roles/Privacy-Data-Safety`
  - What it is: a phase-agnostic privacy/data-safety role reference for local-path leakage, private-content exposure, retained user data, and consent/retention review.
  - Use when: a skill needs review of repo-visible private material or data-handling safety.
  - Do not use when: the task mainly concerns exploitability rather than privacy/data-safety.
- `Roles/QA-Reliability`
  - What it is: a phase-agnostic QA/reliability role reference for failure handling, rollback/recovery, degraded mode, and test-signal review.
  - Use when: a skill needs resilience and diagnosability review for an approved slice.
  - Do not use when: the task mainly concerns raw performance or another specialist domain.
- `Roles/Performance`
  - What it is: a phase-agnostic performance role reference for hot-path waste, blocking work, latency, throughput, and resource-impact review.
  - Use when: a skill needs focused performance review where speed or resource budget is the primary concern.
  - Do not use when: the task mainly needs general correctness review without a meaningful performance angle.
- `Roles/TechWriter`
  - What it is: a phase-agnostic technical-documentation role reference for teaching-oriented docs writing and review.
  - Use when: a skill needs strong documentation judgment for setup, usage, onboarding, migration, API explanation, or reference clarity.
  - Do not use when: the task mainly needs framing, positioning, or devrel messaging.
- `Roles/DevRel`
  - What it is: a phase-agnostic developer-facing messaging role reference for framing, positioning, and devrel copy.
  - Use when: a skill needs README intros, launch copy, feature blurbs, docs openings, or other messaging where the main job is framing and credible payoff.
  - Do not use when: the task mainly needs teaching-oriented documentation structure or usage explanation.

If you need...
- a runnable skill -> go to [`skills/`](#skill-index)
- a reusable reviewer/writer/specialist role -> go to [`Roles/`](#role-index)
- a repo-level shared rule or memory convention -> go to [`conventions/`](#conventions)
- to create or rewrite a skill -> start with [`skills/create-skill`](#skill-index)

## How this repo works

Think of the repo in three layers:

1. `skills/` — executable skill source
   - each skill lives in its own folder
   - runtime entrypoint is `skills/<name>/SKILL.md`
   - references, scripts, and assets live beside it

2. `Roles/` — reusable role contracts
   - these are not runnable skills
   - they hold canonical specialist identity, rubric, and learnings
   - skills should load and adapt them instead of re-owning the same role prose

3. `conventions/` — repo-level defaults
   - shared conventions that multiple roles or skills may reference
   - use these when the rule is broader than one skill but narrower than general repo docs

## Repo map

```text
skills/         runnable skill folders
Roles/          reusable role contracts
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
Roles/<Role-Name>/
  ROLE.md
  RUBRIC.md
  LEARNINGS.md
```

When a canonical label and folder path differ, the folder path is the source of truth.
Current non-trivial mappings:
- `frontend taste` -> `Roles/Frontend-Taste`
- `privacy/data-safety` -> `Roles/Privacy-Data-Safety`
- `qa/reliability` -> `Roles/QA-Reliability`

## Common workflows

### Find the right skill

- README/launch framing, messaging, positioning -> `skills/devrel-copywriter`
- docs, setup, usage, onboarding, API explanation -> `skills/docs-writer`
- create or refactor a skill -> `skills/create-skill`
- planning + slice + approval flow for code work -> `skills/dev-harness`
- multi-role review -> `skills/code-review-orchestrator`
- pre-implementation proposal + critique -> `skills/research-critic`

### Reuse a role

If a skill needs a reusable specialist voice:
- load from `Roles/`
- adapt it to the current phase
- keep role identity in `Roles/`, not in local copied prose

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

- `skills/code-review-orchestrator`
  - What it is: one entrypoint for multi-role code review with merged findings.
  - Use when: the user wants a repo, diff, branch, or PR reviewed from one or more specialist angles.
  - Do not use when: the main job is pre-implementation planning or direct implementation.

- `skills/research-critic`
  - What it is: reusable pre-implementation research + critique packet builder.
  - Use when: a task needs proposal quality, readiness judgment, or structured research before implementation.
  - Do not use when: implementation or PR review should already be happening.

- `skills/grill-me`
  - What it is: scoping/interrogation helper for unclear tasks.
  - Use when: the real problem is still figuring out what should be built.
  - Do not use when: the work is already scoped enough for `create-skill` or implementation.

### Frontend and architecture specialties

- `skills/design-taste-frontend`
  - What it is: design-taste lens for frontend quality.
  - Use when: the task needs stronger visual/product judgment for UI work.
  - Do not use when: the task is backend-only or mostly docs.

- `skills/vercel-react-best-practices`
  - What it is: reusable React/Next.js guidance.
  - Use when: frontend work touches React/Next.js slices.
  - Do not use when: the task is not React/Next.js work.

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

## Role index

Roles are reusable references, not executable skills.
Use them when a skill needs a stable specialist identity across phases.

- `Roles/Architect`
  - Architecture fit, boundaries, seams, DDD alignment, record updates.
- `Roles/Backend`
  - Backend/server implementation and review judgment.
- `Roles/Critic`
  - Adversarial pressure on assumptions, scope, risk, and complexity.
- `Roles/DevRel`
  - Developer-facing framing, positioning, and messaging quality.
- `Roles/Frontend`
  - Frontend/client implementation and review judgment.
- `Roles/Frontend-Taste`
  - Rendered UI taste, hierarchy, spacing, typography, composition, and polish, with routed learnings by project type.
- `Roles/Performance`
  - Hot-path, latency, throughput, blocking work, and resource impact.
- `Roles/Privacy-Data-Safety`
  - Local-path leakage, repo-visible private content, retention, and consent safety.
- `Roles/QA-Reliability`
  - Failure handling, rollback/recovery, degraded mode, diagnosability, and test signal.
- `Roles/Security`
  - Exploitability, auth, injection, secrets, and trust-boundary risk.
- `Roles/TechWriter`
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
- Keep `Roles/` as the source of truth for reusable role references.
- Keep `conventions/` as the source of truth for repo-level reusable conventions.
- Prefer loading/adapting roles from `Roles/` over copying role prose into skills.
- Prefer referencing `conventions/` over inventing duplicated repo-wide wording inside one skill.
- Do not add extra docs inside a skill folder unless they are part of runtime behavior.
- Do not copy repo/editor docs into a skill unless that content is actually needed at runtime.
