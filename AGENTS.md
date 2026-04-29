# AGENTS.md

## Repo rules
- This repo is self-contained.
- Do not rely on critical external skill dependencies.
- If a skill depends on another skill, that dependency must also live in this repo.
- Copy skills into `skills/`; never move them out of their source location.
- Copy the runtime-required skill contents, including references, scripts, assets, and any other required files.
- Do not copy auxiliary repo/editor docs when they are not part of the skill runtime behavior.
- `skills/` is the source of truth for local runtime loading.
- Avoid premature shared infrastructure across skills.
- If a small repeated dependency is simpler to embed as behavior than to turn into cross-skill coupling, embed it.
