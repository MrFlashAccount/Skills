# Skills Repo

Local source-of-truth repo for copied OpenClaw skills and their packaged `.skill` bundles.

## Layout
- source skills live in `skills/`
- packaged bundles are written to `dist/`
- the pack script lives in `scripts/pack_skills.py`

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

## Rebuild `dist/`
From the repo root:

```bash
python3 scripts/pack_skills.py
```

Requires Python 3 and an OpenClaw install that provides the upstream packager.
The script packages every `skills/*` folder that contains `SKILL.md` into `dist/`.
If auto-discovery cannot find the upstream packager, point it at one explicitly:

```bash
OPENCLAW_PACKAGE_SKILL=/path/to/package_skill.py python3 scripts/pack_skills.py
```

## Add or update a skill
1. Copy the full runtime + packaging contents into `skills/<skill-name>/`.
2. Keep any critical skill dependencies in this repo too.
3. Run `python3 scripts/pack_skills.py`.
4. Commit the source changes and rebuilt `dist/*.skill` files together.

## Repo rules
- Keep the repo self-contained.
- Do not rely on external skill dependencies for runtime-critical behavior.
- Rebuild `dist/` whenever a source skill changes.
- Commit source folders and packaged artifacts in the same change.
