# OpenClaw skills repo

![Skills logo](assets/skills-logo.png)

Skills are ingredients. Roles give them judgment. Workflows make them useful.

A source repo for composable AI building blocks: runnable skills, reusable roles, shared references, and workflows that turn them into repeatable work.

Use this repo to find the right building block, understand how the parts fit together, and compose them into practical task flows.

## What this is

This repository is the editable source for a modular AI workbench.

It contains:
- `skills/`: runnable skill entrypoints and their local references
- `roles/`: reusable specialist contracts and rubrics
- `shared/`: reference packages meant to be loaded or adapted, not run directly
- `conventions/`: repo-level rules and defaults shared across multiple parts

The point of the repo is composition. A single task may need a skill for execution, a role for judgment, a shared package for context, and a workflow that keeps the sequence consistent.

## How the pieces fit together

Think of the repo as four layers:

1. `skills/` provide runnable task behavior.
2. `roles/` provide stable specialist judgment.
3. `shared/` provides reusable supporting context.
4. `conventions/` provides cross-cutting defaults.

A good composition usually looks like this:
- start with a skill that owns the task flow
- load a role when the work needs a consistent specialist lens
- pull from `shared/` when several skills need the same reference material
- rely on `conventions/` when the rule belongs to the repo, not a single skill

That keeps execution logic, judgment, reference material, and repo-wide defaults separate enough to reuse cleanly.

## Start by task

This repo is for people who author, edit, review, or route OpenClaw skills. The first job of this README is simple: help you choose the right entrypoint fast.

If you need to...
- use or edit a runnable skill -> start in `skills/`
- use a specialist lens without turning it into a skill -> check `roles/`
- reuse cross-skill reference material that should not be a runnable skill -> check `shared/`
- follow repo-wide defaults or memory rules -> check `conventions/`

Good first picks:
- repo README framing or DevRel entrypoint work -> `skills/devrel-copywriter`
- setup, usage, onboarding, migration, or API docs -> `skills/docs-writer`
- build or rewrite a skill folder -> `skills/create-skill`
- research before implementation -> `skills/research-critic`
- execution planning and delegation after approved research -> `skills/dev-harness`
- implementation after approval -> `skills/implementation-harness`
- post-implementation review -> `skills/code-review-orchestrator`
- architecture package or architecture-memory work -> `skills/create-architecture`
- design-memory work -> `skills/create-design`

## Choose the right entrypoint

Use...
- a **skill** when you need a runnable workflow with its own `SKILL.md`
- a **role** when you need a reusable specialist lens such as `architect`, `critic`, `frontend`, or `tech-writer`
- a **shared package** when material should stay reusable but should not appear as a runnable skill
- a **convention** when the rule is repo-wide and should stay outside any one skill

Within this repo's conventions, `skills/` is the source of truth for local skill runtime loading. `shared/` is intentionally not a runtime skill catalog.

If you are adding or updating a skill, keep `SKILL.md` focused and move heavier detail into nearby references.

## Repo map

```text
<<<<<<< HEAD
skills/         runnable skill folders with SKILL.md entrypoints
roles/          reusable role contracts and rubrics
shared/         reusable reference packages, not runnable skills
conventions/    repo-wide reusable conventions
SPDD-lite.md    lightweight repo process doc
README.md       front door and router
AGENTS.md       repo rules for contributors and editors
||||||| parent of 2aeb9b6 (Harden DevRel README workflow gates)
skills/         runnable skill folders
roles/          reusable role contracts
shared/         reusable reference packages, not runtime skills
conventions/    shared repo-level conventions
SPDD-lite.md    lightweight process doc
README.md       onboarding + repo map
=======
skills/         runnable skill folders
roles/          reusable role contracts
shared/         shared reference packages
conventions/    repo-level defaults and rules
SPDD-lite.md    lightweight process note
README.md       repo entrypoint and composition guide
>>>>>>> 2aeb9b6 (Harden DevRel README workflow gates)
```

Canonical folder shapes:

```text
skills/<skill-name>/
  SKILL.md
  references/
  scripts/      # optional
  assets/       # optional
```

```text
roles/<role-name>/
  ROLE.md
  RUBRIC.md
  ... role-owned supporting files
```

```text
shared/<package-name>/
  README.md
  *.md
```

<<<<<<< HEAD
## Skill index

All current skill directories with `SKILL.md` (`find skills -maxdepth 2 -name SKILL.md | sort`):

### Writing, messaging, and communication

- `skills/caveman`
  - What it is: ultra-compressed communication mode for very short, high-signal replies.
  - Use when: the user explicitly wants fewer tokens, very brief wording, or "caveman" mode.
  - Do not use when: the reply needs careful nuance, safety wording, or normal user-facing tone.

- `skills/cover-letter-writer`
  - What it is: workflow for short, high-conviction cover letters and hiring outreach.
  - Use when: the task is a job-specific cover letter, recruiter reply, warm intro, or hiring-manager outreach.
  - Do not use when: the task is general docs, repo copy, or non-hiring writing.

- `skills/devrel-copywriter`
  - What it is: workflow for repository README framing, opening structure, and developer-facing positioning.
  - Use when: the README acts as the product-facing front door and needs message hierarchy or a stronger opening.
  - Do not use when: the main job is teaching setup, usage, migration, configuration, or API behavior.

- `skills/docs-writer`
  - What it is: workflow for documentation that teaches usage, setup, onboarding, migration, and API/reference behavior.
  - Use when: the main job is helping readers succeed through clearer explanation and sequencing.
  - Do not use when: the main job is positioning, README opening copy, or polish-first DevRel framing.

- `skills/forthright`
  - What it is: high-compression communication mode for agent-to-agent work and internal operating files.
  - Use when: the audience is another worker/subagent or the task is compressing internal operational text.
  - Do not use when: the text is user-facing, external, safety-sensitive, or a destructive confirmation.

- `skills/humanizer`
  - What it is: polish pass that makes a draft sound more natural without changing the core message.
  - Use when: the text already exists and mainly needs tone, rhythm, or warmth cleanup.
  - Do not use when: the real problem is strategy, domain judgment, or a structural rewrite.

### Planning, research, implementation, and review

- `skills/code-review-orchestrator`
  - What it is: one entrypoint for multi-role code review with merged findings and a review verdict.
  - Use when: the user wants a repo, branch, PR, diff, or file set reviewed from one or more specialist angles.
  - Do not use when: the task is still in research, planning, or direct implementation.

- `skills/create-architecture`
  - What it is: workflow for architecture direction, architecture-memory artifacts, architectural audits, and migration slicing.
  - Use when: the task is to create, align, improve, or audit architecture decisions or `ARCHITECTURE.md`-style artifacts.
  - Do not use when: the task is a generic best-practices dump or implementation without architecture shaping.

- `skills/create-design`
  - What it is: workflow for design-memory systems, `DESIGN.md`-style artifacts, and design-rule restructuring.
  - Use when: the task is approved design-memory review, proposal, creation, or rewrite work.
  - Do not use when: the task is ordinary frontend implementation or unapproved design-memory work.

- `skills/create-skill`
  - What it is: workflow for creating, rewriting, auditing, or restructuring an OpenClaw skill folder.
  - Use when: the task is to build a skill from source material or refactor how a skill is packaged.
  - Do not use when: the task is still too fuzzy and needs interrogation before a skill plan exists.

- `skills/dev-harness`
  - What it is: execution-planning harness that turns approved research into an implementation contract and delegation path.
  - Use when: research is already approved and the next job is planning or routing implementation.
  - Do not use when: the task still needs broad discovery or is already ready for direct implementation.

- `skills/github-ticket-intake`
  - What it is: workflow for turning messy requests into GitHub issues, optional linked ticket sets, and project placement.
  - Use when: the user wants issue creation, ticket splitting, or rough notes turned into tracked GitHub work.
  - Do not use when: the task is implementation, code review, or general GitHub administration outside ticket intake.

- `skills/grill-me`
  - What it is: interrogation workflow that pressure-tests a plan or design one question at a time.
  - Use when: the user wants to be grilled, stress-test a plan, or force decision-tree clarity.
  - Do not use when: the scope is already settled enough for execution or writing.

- `skills/implementation-harness`
  - What it is: post-approval implementation-stage harness for executing against an already closed contract.
  - Use when: the task already has approved research and execution-planning context and now needs implementation.
  - Do not use when: the task still needs approval, discovery, or independent post-implementation review.

- `skills/improve-codebase-architecture`
  - What it is: legacy reference skill for architecture deepening concepts such as seams, locality, and module depth.
  - Use when: you want donor/reference material while doing architecture work through `skills/create-architecture`.
  - Do not use when: you need the active architecture workflow as the primary entrypoint.

- `skills/research-critic`
  - What it is: pre-implementation research workflow built around Researcher -> attack -> final verdict.
  - Use when: the task needs context closure, assumption pressure, or a readiness packet before planning or architecture work.
  - Do not use when: the job is implementation, final architecture contract ownership, or post-implementation review.

### Roles, routing, and repo utilities

- `skills/hat`
  - What it is: sticky conversation-level role lens activator for repo roles.
  - Use when: the user wants `hat <role>`, wants to switch roles, or wants to know which role lens is active.
  - Do not use when: the task needs a full workflow rather than a temporary role-mode switch.

- `skills/obsidian`
  - What it is: workflow for working with Obsidian vaults, notes, searches, and note operations.
  - Use when: the task touches an Obsidian vault or Obsidian CLI note workflows.
  - Do not use when: the task has nothing to do with Obsidian notes or vaults.

- `skills/ruslo`
  - What it is: placeholder skill directory whose `SKILL.md` currently contains only `TODO`.
  - Use when: you are intentionally inspecting or completing that placeholder.
  - Do not use when: you need a finished workflow; this entry is not yet documented as an active skill.

## Roles

Roles are reusable specialist containers, not runnable skills.

Current role directories:
- `roles/architect`
- `roles/backend`
- `roles/critic`
- `roles/dev-rel`
- `roles/frontend`
- `roles/frontend-taste`
- `roles/marketing`
- `roles/performance`
- `roles/privacy-data-safety`
- `roles/qa-reliability`
- `roles/researcher`
- `roles/security`
- `roles/tech-writer`

Use a role when the job is mainly about perspective or judgment. Use a skill when the job is mainly about workflow.

## Shared reference packages

Shared packages are reusable reference material for skills and authors. They are intentionally discoverable here without being runnable skills.

- `shared/delegate`
  - Delegation principles, worker contracts, and reusable inclusion snippets.
- `shared/go-to-market-context`
  - Reusable product, audience, JTBD, pain, differentiation, and messaging context.

## Conventions

Repo-wide reusable conventions:
- `conventions/repo-architecture-memory.md`
- `conventions/repo-design-memory.md`

Use these when the rule should live above any one skill or role.

## Working rules that matter most

From `AGENTS.md`, the practical defaults are:
- keep `skills/` as the source of truth for runtime skill behavior in this repo
- keep `shared/` for reusable packages that must not contain `SKILL.md`
- keep roles reusable instead of copying role prose into skills
- list skills in this README with compact routing guidance
- treat a skill as a workflow/process tool, not a facade for a role

## Process pointer

If you need the lightweight repo workflow, see `SPDD-lite.md`.
||||||| parent of 2aeb9b6 (Harden DevRel README workflow gates)
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
=======
## Examples of composition

### README rewrite workflow

- skill: `skills/devrel-copywriter`
- role: `roles/dev-rel`
- references: `skills/devrel-copywriter/references/`
- output: a repository README with stronger framing, structure, and review gates

### New skill creation

- skill: `skills/create-skill`
- supporting workflow: `skills/dev-harness` when scope and approval need to be locked first
- roles or shared references: loaded only when the skill needs a specific lens or reusable contract
- output: a new or rewritten skill folder with a cleaner runtime shape

### Multi-role review

- skill: `skills/code-review-orchestrator`
- roles: whichever reviewer lenses the task needs
- shared packages: optional, when multiple reviewers need the same reference contract
- output: merged findings from several specialist perspectives
>>>>>>> 2aeb9b6 (Harden DevRel README workflow gates)
