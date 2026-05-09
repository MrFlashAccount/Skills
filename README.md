# Skills

Self-contained source-of-truth repo for OpenClaw skills.

This repo keeps the editable skill folders in one place. Local OpenClaw runtime loads skills directly from `skills/` via each skill's `SKILL.md`, so packaged `.skill` bundles are not required for normal local use.

## Process docs
- [SPDD-lite](skills/SPDD-LITE.md)
  - What it is: a lightweight process model for AI-assisted workflow design.
  - Use when: you need a compact guide for scope, assumptions, approval, freshness, and risk scaling.
  - Do not use when: the task is pure implementation work or when a heavyweight process template is expected.

## Layout
- `skills/<skill-name>/` — canonical source for each skill in this repo
- `Roles/<role-name>/` — canonical source for reusable role references that skills should load and adapt instead of copying into per-skill prose
- `conventions/*.md` — reusable conventions for target repos that define documentation and memory standards, with repo-local equivalents allowed when the same durable purpose is preserved

## Roles
Role folders are reusable references, not executable skills.
Common shape:
- `ROLE.md` — canonical role contract
- `RUBRIC.md` — compressed derivative checklist
- `LEARNINGS.md` — append-only role memory

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

## Conventions
- `conventions/repo-architecture-memory.md`
  - What it is: a repo-level convention for deciding how project-specific architecture memory should be recorded in a target repo.
  - Use when: a role or skill needs a default rule for context glossaries, context maps, decision logs, and equivalent repo-local artifacts.
  - Do not use when: the task only needs reusable role judgment with no project-specific memory contract.

## Current skills
- `skills/caveman`
  - What it is: ultra-compressed reply mode that drops filler but keeps technical meaning.
  - Use when: the user wants brevity, caveman mode, or token-efficient replies.
  - Do not use when: the reply is user-facing high-stakes warning, destructive confirmation, or needs normal tone.
- `skills/code-review-orchestrator`
  - What it is: one entrypoint for multi-role code review with merged findings.
  - Use when: the user wants a repo, diff, branch, or PR reviewed from one or more specialist angles.
  - Do not use when: the main job is pre-implementation planning or direct implementation.
- `skills/cover-letter-writer`
  - What it is: short, high-conviction cover-letter and outreach writing harness.
  - Use when: the user wants a cover letter, recruiter opener, DM, or hiring-manager outreach.
  - Do not use when: the job is general copy polish on an existing draft without cover-letter strategy.
- `skills/create-skill`
  - What it is: execution-stage harness for turning scoped source material into a real skill folder.
  - Use when: the skill shape is already clear and the task is to build or refine the skill files.
  - Do not use when: discovery is still fuzzy or approval to start implementation is not in place.
- `skills/design-taste-frontend`
  - What it is: strict frontend UI/UX quality system for non-generic interface design.
  - Use when: the task is designing or refining user-facing frontend UI with strong visual and interaction standards.
  - Do not use when: the work is backend-only or the ask is pure docs/copy without UI implementation.
- `skills/dev-harness`
  - What it is: top-level coding harness for discovery, proposal, approval, and delegation.
  - Use when: the task needs planning, slicing, approval flow, or durable coordination across implementation stages.
  - Do not use when: scope is already approved and closed for direct implementation.
- `skills/devrel-copywriter`
  - What it is: developer-facing positioning and product-messaging writing harness.
  - Use when: the job is README framing, launch copy, changelog messaging, or devrel angle/polish.
  - Do not use when: the main job is explaining setup, usage, onboarding, migration, or API behavior.
- `skills/docs-writer`
  - What it is: documentation-writing harness for teaching setup, usage, flow, and reference clearly.
  - Use when: the main job is improving product or library docs so readers succeed faster and more correctly.
  - Do not use when: the task is narrative framing, launch copy, or polish-first devrel messaging.
- `skills/forthright`
  - What it is: compressed agent-to-agent communication mode for operational handoffs and internal files.
  - Use when: coordinating workers/reviewers or compressing maintainer-operational text such as AGENTS, plans, or summaries.
  - Do not use when: writing user-facing replies, external messages, safety warnings, or destructive confirmations.
- `skills/github-ticket-intake`
  - What it is: GitHub issue-intake harness that shapes rough requests into issues or small ticket sets.
  - Use when: the user wants rough work turned into tracked GitHub issues, project items, or board-ready tickets.
  - Do not use when: the work is implementation, research, or non-GitHub task breakdown.
- `skills/grill-me`
  - What it is: one-question-at-a-time design and plan stress-test interview.
  - Use when: the user wants their plan challenged, clarified, or pressure-tested branch by branch.
  - Do not use when: the task is ready for execution and does not need an interrogation loop.
- `skills/humanizer`
  - What it is: rewrite pass that makes existing text sound more natural and less AI-polished.
  - Use when: the user already has draft text and wants it warmer, cleaner, shorter, or more human.
  - Do not use when: the job needs domain strategy, major restructuring, or first-draft content creation.
- `skills/improve-codebase-architecture`
  - What it is: architecture review harness for finding deepening opportunities in a codebase.
  - Use when: the user wants refactor candidates that improve locality, leverage, testability, and AI navigability.
  - Do not use when: the ask is narrow bug-fixing or immediate implementation without architecture exploration.
- `skills/implementation-harness`
  - What it is: post-approval implementation harness for executing against closed research.
  - Use when: approved task context and research already exist and the job is to implement, verify, and review.
  - Do not use when: approval, research, or implementation-critical facts are still open.
- `skills/obsidian`
  - What it is: operational guide for working with Obsidian vaults and `obsidian-cli`.
  - Use when: the task is finding a vault, editing notes, searching content, or moving/deleting notes safely.
  - Do not use when: the task is generic markdown editing outside an Obsidian-vault workflow.
- `skills/research-critic`
  - What it is: pre-implementation research packet with proposal, critique, and readiness verdict.
  - Use when: the user wants a task researched, broken down, challenged, or prepared for implementation.
  - Do not use when: the job is implementation, GitHub issue transport, or execution ownership.
- `skills/vercel-react-best-practices`
  - What it is: Vercel-maintained React and Next.js performance and code-quality rule set.
  - Use when: writing, reviewing, or refactoring React/Next.js code for rendering, data-fetching, or bundle performance.
  - Do not use when: the code is not React/Next.js or the task is broader product docs/copy work.

## Add or update a skill
1. Copy the runtime-required contents into `skills/<skill-name>/`.
2. Copy any runtime-critical skill dependencies this repo needs.
3. Commit the source changes together.

## Repo rules
- Keep the repo self-contained.
- Do not rely on external skill dependencies for runtime-critical behavior.
- Do not copy repo/editor docs unless they are part of the actual skill runtime behavior.
- Keep `skills/` as the source of truth for skill runtime behavior.
- Keep `Roles/` as the source of truth for reusable role references.
- Keep `conventions/` as the source of truth for repo-level reusable conventions.
- When a skill needs a role from `Roles/`, prefer loading and adapting that role in context instead of copying its prose into the skill.
- When a role or skill needs repo-specific architecture memory rules, prefer referencing `conventions/` instead of inventing local wording from scratch.
