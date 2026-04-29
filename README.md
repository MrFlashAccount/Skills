# Skills

Curated source-of-truth repo for OpenClaw skills and their packaged `.skill` bundles.

This repo keeps the editable skill source and the distributable artifacts in one place:
- `skills/` holds the canonical source folders
- `dist/` holds the packaged bundles built from that source

Use it when you want a self-contained skills repo that is easy to maintain, rebuild, and share.

## Layout
- `skills/<skill-name>/` — source of truth for each skill in this repo
- `dist/<skill-name>.skill` — packaged artifact built from the source skill
- `scripts/pack_skills.py` — rebuilds every packable skill in `skills/`

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
- `skills/grill-me`
- `skills/humanizer`
- `skills/obsidian`
- `skills/vercel-react-best-practices`

## Rebuild bundles
From the repo root:

```bash
python3 scripts/pack_skills.py
```

Requirements:
- Python 3
- an OpenClaw install that provides the upstream packaging script

The pack script discovers every `skills/*` folder that contains `SKILL.md` and writes the rebuilt `.skill` bundles to `dist/`.

If auto-discovery cannot find the upstream packager, point it at one explicitly:

```bash
OPENCLAW_PACKAGE_SKILL=/path/to/package_skill.py python3 scripts/pack_skills.py
```

## Add or update a skill
1. Copy the runtime- and packaging-required contents into `skills/<skill-name>/`.
2. Copy any runtime-critical skill dependencies this repo needs.
3. Rebuild `dist/` with `python3 scripts/pack_skills.py`.
4. Commit the source changes and rebuilt `dist/*.skill` files together.

## Repo rules
- Keep the repo self-contained.
- Do not rely on external skill dependencies for runtime-critical behavior.
- Do not copy repo/editor docs unless they are part of the actual skill package or runtime behavior.
- Rebuild `dist/` whenever a source skill changes.
- Commit source folders and packaged artifacts in the same change.
