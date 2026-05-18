# Skills

![Skills logo](assets/skills-logo.png)

Skills are ingredients. Roles give them judgment. Workflows make them useful.

A source repo for composable AI building blocks: runnable skills, reusable roles, shared references, and workflows that turn them into repeatable work.

Use this repo to find the right building block, understand how the parts fit together, and compose them into practical task flows.

## What this is

This repository is the editable source for a modular AI workbench.

It contains:
- `skills/`: runnable skill entrypoints and their local references
- `roles/`: reusable specialist contracts, rubrics, and learnings
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

## How to use this repo

Use this repo when you want to:
- find the right building block for a task
- understand where a behavior should live before editing it
- reuse an existing role or reference package instead of copying prose
- compose several parts into a repeatable workflow

A simple way to navigate:
- need runnable task behavior: start in `skills/`
- need a reusable specialist lens: start in `roles/`
- need shared supporting material: start in `shared/`
- need a broader repo rule: start in `conventions/`

If you are adding or updating a skill, keep `SKILL.md` focused and move heavier detail into nearby references.

## Repo map

```text
skills/         runnable skill folders
roles/          reusable role contracts
shared/         shared reference packages
conventions/    repo-level defaults and rules
SPDD-lite.md    lightweight process note
README.md       repo entrypoint and composition guide
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
roles/<role-name>/
  ROLE.md
  RUBRIC.md
  LEARNINGS.md
```

### Shared package folder

```text
shared/<package-name>/
  README.md
  *.md
```

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
