# Skills Repo

Local self-contained repository for copied skills and their packaged `.skill` artifacts.

## Current skills
- `code-review-orchestrator`
- `design-taste-frontend`
- `dev-harness`
- `devrel-copywriter`
- `docs-writer`
- `vercel-react-best-practices`

## Rebuild dist packages
From this repo root:

```bash
PKG="/path/to/openclaw/skills/skill-creator/scripts/package_skill.py"  # set this for your machine
rm -f dist/*.skill
for skill in code-review-orchestrator design-taste-frontend dev-harness devrel-copywriter docs-writer vercel-react-best-practices; do
  python3 "$PKG" "$PWD/$skill" "$PWD/dist"
done
```

## Add a new skill
1. Copy the full skill folder into the repo root as a sibling of the existing skills.
2. Package it into `dist/` with the same `package_skill.py` flow.
3. Commit the source folder and `dist/` changes together.

## Notes
Critical cross-skill dependencies for the core skills in this repo are copied locally and packaged into `dist/`.
