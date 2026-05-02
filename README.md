# Skills

Self-contained source-of-truth repo for OpenClaw skills.

This repo keeps the editable skill folders in one place. Local OpenClaw runtime loads skills directly from `skills/` via each skill's `SKILL.md`, so packaged `.skill` bundles are not required for normal local use.

## Layout
- `skills/<skill-name>/` — canonical source for each skill in this repo

## Current skills
- `skills/caveman`
- `skills/code-review-orchestrator`
- `skills/cover-letter-writer`
- `skills/create-skill`
- `skills/design-taste-frontend`
- `skills/dev-harness`
- `skills/devrel-copywriter`
- `skills/docs-writer`
- `skills/forthright`
- `skills/github-ticket-intake`
- `skills/grill-me`
- `skills/humanizer`
- `skills/implementation-harness`
- `skills/obsidian`
- `skills/research-critic`
- `skills/vercel-react-best-practices`

## Add or update a skill
1. Copy the runtime-required contents into `skills/<skill-name>/`.
2. Copy any runtime-critical skill dependencies this repo needs.
3. Commit the source changes together.

## Repo rules
- Keep the repo self-contained.
- Do not rely on external skill dependencies for runtime-critical behavior.
- Do not copy repo/editor docs unless they are part of the actual skill runtime behavior.
- Keep `skills/` as the source of truth.
