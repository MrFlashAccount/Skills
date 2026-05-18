<p align="center">
  <img src="assets/skills-logo.png" alt="Skills logo" width="220">
</p>

<h1 align="center">Skills</h1>

<p align="center">Skills are ingredients. Roles give them judgment. Workflows make them useful.</p>

Composable AI building blocks for reusable execution, specialist judgment, shared reference material, and repeatable task flows.

## What this is

This repo is the editable source for a modular AI workbench.

It keeps four kinds of building blocks in one place:
- `skills/` for runnable task workflows with `SKILL.md` entrypoints
- `roles/` for reusable specialist judgment and rubrics
- `shared/` for reference packages that should be loaded or adapted, not run directly
- `conventions/` for repo-level defaults shared across multiple skills or roles

The main idea is composition: one task might use a skill for execution, a role for judgment, a shared package for context, and a convention for repo-wide defaults.

## How the pieces fit together

Think in layers:
1. `skills/` own task flow.
2. `roles/` add a stable specialist lens.
3. `shared/` holds reusable supporting context.
4. `conventions/` holds cross-cutting repo rules.

Typical composition:
- start with a skill that owns the workflow
- load a role when the work needs specialist judgment
- pull from `shared/` when several skills need the same reference package
- rely on `conventions/` when a rule belongs to the repo, not one skill

That separation keeps execution logic, judgment, reference material, and repo-wide defaults reusable without collapsing them into one folder.

## How to use this repo

If you need...
- a runnable workflow, start in `skills/`
- a reusable specialist lens, check `roles/`
- cross-skill reference material, check `shared/`
- repo-wide defaults or memory rules, check `conventions/`

### Skill routing table

| Skill | Use when | Avoid when |
| --- | --- | --- |
| `skills/caveman` | You need ultra-short, high-signal replies. | The output needs nuance, safety wording, or a normal user-facing tone. |
| `skills/code-review-orchestrator` | You want a repo, branch, PR, or diff reviewed from multiple specialist angles. | The task is still in research, planning, or direct implementation. |
| `skills/cover-letter-writer` | The task is a job-specific cover letter or hiring outreach. | The task is general docs, repo copy, or non-hiring writing. |
| `skills/create-architecture` | The work is architecture direction, audits, migrations, or architecture-memory artifacts. | The task is generic implementation with no architecture shaping. |
| `skills/create-design` | The work is approved design-memory review, proposal, creation, or rewrite. | The task is ordinary frontend implementation or unapproved design-memory work. |
| `skills/create-skill` | You are creating, rewriting, auditing, or restructuring a skill folder. | Scope is still too fuzzy and needs interrogation first. |
| `skills/dev-harness` | Research is closed enough and the next step is execution planning, slicing, approval flow, or delegation. | The task still needs discovery or is already ready for direct implementation. |
| `skills/devrel-copywriter` | The README or entrypoint needs stronger framing, hierarchy, or developer-facing positioning. | The main job is setup, migration, configuration, or API behavior. |
| `skills/docs-writer` | The main job is teaching usage, setup, onboarding, migration, or reference behavior. | The main job is positioning or README opening copy. |
| `skills/forthright` | Internal operating text needs a blunt compression pass. | The text is user-facing, external, safety-sensitive, or a destructive confirmation. |
| `skills/github-ticket-intake` | Rough requests need to become GitHub issues, ticket splits, or tracked work. | The task is implementation, code review, or generic GitHub admin. |
| `skills/grill-me` | A plan needs to be pressure-tested one question at a time. | Scope is already settled enough for execution or writing. |
| `skills/hat` | You want to activate or switch a repo role lens in conversation. | The task needs a full workflow rather than a temporary role mode. |
| `skills/humanizer` | A draft already exists and mainly needs tone or rhythm cleanup. | The real problem is strategy, domain judgment, or structure. |
| `skills/implementation-harness` | Scope is already approved and the main job is implementation. | The task still needs approval shaping, discovery, or independent review. |
| `skills/improve-codebase-architecture` | You want legacy donor material while doing architecture work through `skills/create-architecture`. | You need the active architecture workflow as the primary entrypoint. |
| `skills/obsidian` | The task touches an Obsidian vault, notes, or note workflows. | The task has nothing to do with Obsidian. |
| `skills/research-critic` | The task needs context closure, assumption pressure, or a readiness packet before implementation. | The job is implementation, final architecture ownership, or post-implementation review. |
| `skills/ruslo` | You are intentionally inspecting or completing the placeholder skill. | You need a finished workflow. |

### Other repo building blocks

Roles are reusable specialist containers, not runnable skills:
`roles/architect`, `roles/backend`, `roles/critic`, `roles/dev-rel`, `roles/frontend`, `roles/frontend-taste`, `roles/marketing`, `roles/performance`, `roles/privacy-data-safety`, `roles/qa-reliability`, `roles/researcher`, `roles/security`, `roles/tech-writer`.

Shared reference packages are discoverable but intentionally not runnable skills:
- `shared/delegate`
- `shared/go-to-market-context`

Repo-wide conventions currently live in:
- `conventions/repo-architecture-memory.md`
- `conventions/repo-design-memory.md`

## Repo map

```text
skills/         runnable skill folders with SKILL.md entrypoints
roles/          reusable role contracts and rubrics
shared/         reusable reference packages, not runnable skills
conventions/    repo-level defaults and rules
SPDD-lite.md    lightweight repo process doc
README.md       repo entrypoint and composition guide
AGENTS.md       contributor and editor rules
assets/         shared repo assets, including the logo
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

When a canonical label and folder path differ, the folder path is the source of truth.
Current non-trivial mappings:
- `frontend taste` -> `roles/frontend-taste`
- `privacy/data-safety` -> `roles/privacy-data-safety`
- `qa/reliability` -> `roles/qa-reliability`

## Examples of composition

### README rewrite workflow

- skill: `skills/devrel-copywriter`
- role: `roles/dev-rel`
- references: `skills/devrel-copywriter/references/`
- output: a README with sharper framing, structure, and review gates

### New skill creation

- skill: `skills/create-skill`
- supporting workflow: `skills/dev-harness` when scope and approval need to be locked first
- optional inputs: a role or shared package when the new skill needs a reusable lens or contract
- output: a new or rewritten skill folder with a cleaner runtime shape

### Multi-role review

- skill: `skills/code-review-orchestrator`
- roles: whichever reviewer lenses the task needs
- shared packages: optional when multiple reviewers need the same reference contract
- output: merged findings from several specialist perspectives
