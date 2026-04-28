# AGENTS.md

## Repo rules
- This repo is self-contained.
- Do not rely on critical external skill dependencies.
- If a skill depends on another skill, that dependency must also live in this repo.
- Copy skills here; never move them out of their source location.
- Copy the runtime- and packaging-required skill contents, including references, scripts, assets, and any other required files.
- Do not copy auxiliary repo/editor docs when they are not part of the skill package or runtime behavior.
- When a source skill changes, rebuild its `.skill` artifact in `dist/`.
- Commit both source folders and rebuilt `dist/` artifacts together.
- Avoid premature shared infrastructure across skills.
- If a small repeated dependency is simpler to embed as behavior than to turn into cross-skill coupling, embed it.
