# AGENTS.md

## Repo rules
- This repo is self-contained.
- Do not rely on critical external skill dependencies.
- If a skill depends on another skill, that dependency must also live in this repo.
- Copy skills into `skills/`; never move them out of their source location.
- Copy the runtime-required skill contents, including references, scripts, assets, and any other required files.
- Do not copy auxiliary repo/editor docs when they are not part of the skill runtime behavior.
- `skills/` is the source of truth for local runtime loading.
- Every skill listed in `README.md` must include compact guidance in this exact shape: `What it is`, `Use when`, `Do not use when`.
- Skills are either simple atomic skills (`caveman`/`forthright`/`hat` style) or workflows that describe a high-level process and the roles they invoke.
- Do not describe a role as the essence of a skill; workflows orchestrate roles, and reusable roles live under `roles/`.
- Every role directory must contain `ROLE.md`, `RUBRIC.md`, and `LEARNINGS.md`; `LEARNINGS.md` may be minimal or empty but must exist.
- Avoid premature shared infrastructure across skills.
- If a small repeated dependency is simpler to embed as behavior than to turn into cross-skill coupling, embed it.
- Directory names should use lowercase kebab-case by default.
- Do not rely on case-only path differences; treat path casing as canonical and consistent.
- Keep convention-required filenames unchanged, including `SKILL.md`, `README.md`, and `AGENTS.md`.
