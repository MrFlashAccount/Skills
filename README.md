# OpenClaw skills repo

Runnable skills, reusable roles, shared reference packages, and repo conventions in one place.

This repo is for people who author, edit, review, or route OpenClaw skills. The first job of this README is simple: help you choose the right entrypoint fast.

## Start by task

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

## Repo map

```text
skills/         runnable skill folders with SKILL.md entrypoints
roles/          reusable role contracts and rubrics
shared/         reusable reference packages, not runnable skills
conventions/    repo-wide reusable conventions
SPDD-lite.md    lightweight repo process doc
README.md       front door and router
AGENTS.md       repo rules for contributors and editors
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
