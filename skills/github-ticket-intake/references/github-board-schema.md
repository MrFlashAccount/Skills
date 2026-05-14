# GitHub Board Schema

This file defines the minimum GitHub project shape the intake skill expects.

## Minimum board fields

- no special field is required for basic project placement
- `Repo` — optional text or single select if you want board-level filtering
- `Priority` — optional single select
- `Status` — optional, but this skill does not set project fields by default; it only adds items to the project

## Helpful later fields

- `Task Kind` — optional research / implementation / bug / refactor / docs
- `PR` — optional linked PR number or URL

## Minimum issue shape

The issue body should contain:
- Summary
- Desired outcome
- In-scope
- Out-of-scope
- Acceptance criteria
- Risks or open questions
- Checklist / subtasks

## Labels

Keep labels boring. Typical starting set:
- repo label
- phase label when useful
- task kind label
- optional risk or priority label

## Board assumptions for this draft

- One board item per meaningful task
- One GitHub issue per board item
- This skill only creates the issue and optionally adds it to the project
- Later task sessions, branches, and PR wiring belong to later layers, not this skill

## Write blockers

If any of these are missing, prefer `draft-only`:
- repo target
- GitHub owner
- project number or project URL mapping
- authenticated GitHub access with project scope when board writes are required

## Preflight note

Before write-ready runs, use [scripts/gh-preflight.mjs](scripts/gh-preflight.mjs) to check that GitHub auth works and that the target project is reachable when project placement is required.
