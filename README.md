# Skills Repo

Local self-contained skill repository for copied skills and their packaged `dist/` artifacts.

## Current skills
- `dev-harness`
- `devrel-copywriter`
- `docs-writer`

## Rebuild dist packages
From this repo root:

```bash
rm -f dist/*.skill
for skill in dev-harness devrel-copywriter docs-writer; do
  tar -czf "dist/${skill}.skill" "$skill"
done
```

## Add a new skill
1. Copy the full skill folder into the repo root as a sibling of the existing skills.
2. Rebuild `dist/` so the new skill also has a packaged `.skill` artifact.
3. Commit the source folder and `dist/` changes together.

## Notes
Dependency audit and path normalization are intentionally a later, separate step.
