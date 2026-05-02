---
name: github-ticket-intake
description: Draft or create GitHub issues from messy request text. Decide whether the request should become one issue, one issue with a checklist, or a small linked ticket set, then create the matching GitHub issues and optional project entries. Use when the user asks to create an issue, split an idea into tickets, put a rough request onto a GitHub project, turn rough notes into tracked issues, or shape transcribed voice/text into GitHub work items. Input modality does not matter: trigger on intent whether the request came as text or from transcribed voice.
---

# GitHub Ticket Intake

Use this as the intake and ticket-shaping harness for GitHub issues/projects work.

This skill is input-agnostic. Voice, chat text, pasted notes, and transcribed audio are all just request text by the time this skill starts. Do not do ASR work here.

Own only:
- capturing the user's raw intent clearly enough to become GitHub work items
- deciding whether the request is one ticket, one ticket with a checklist, or a small set of tickets
- deciding repo, optional project placement, labels, and ticket links when that context is available
- creating GitHub issue artifacts, and project entries when requested and supported

Do not own:
- audio transcription
- Vikra research or project-research work
- KM / Polengi / later taskflow stages
- implementation orchestration
- PR review or fix loops
- broader taskflow automation such as polling, webhooks, or execution routing
- general-purpose GitHub repo administration outside this ticket-intake flow

## Read order

1. Read [references/task-contract.md](references/task-contract.md).
2. Read [references/github-board-schema.md](references/github-board-schema.md).
3. Read [references/workflow.md](references/workflow.md).
4. For validation or maintenance of this skill itself, read [references/testing.md](references/testing.md).

## Task class

- `draft-only`: shape the ticket package, but do not perform GitHub writes yet.
- `write-ready`: shape the ticket package and create GitHub artifacts now.

Default to `draft-only` unless the user clearly wants the GitHub side created now and the required repo context is available. Project placement is optional and should be treated as a separate destination-resolution gate.

## Workflow

1. Route on intent, not modality.
   - Good triggers: create issue, create card, put this on the board, break this into subtasks, turn this into tracked tickets, split this into GitHub tasks, turn this rough note into GitHub issues.
   - Do not trigger for pure implementation asks that should go straight into execution.
2. Build the contract first using [references/task-contract.md](references/task-contract.md).
3. Resolve destination in order: repo known, project required or optional, project known if required, write-now or draft-only.
4. Decide whether this should become one ticket, one ticket with a checklist, or a small linked ticket set.
5. Decide whether the request is `draft-only` or `write-ready`.
6. For `draft-only` work:
   - return a clean ticket package
   - surface the smallest blocking GitHub/context gap if one exists
   - do not fabricate issue URLs, board IDs, labels, or project mappings
7. For `write-ready` work:
   - run [scripts/gh-preflight.mjs](scripts/gh-preflight.mjs) before attempting GitHub writes
   - choose a template from `templates/` when useful, then manually write the final markdown body yourself
   - use [scripts/create-issue.mjs](scripts/create-issue.mjs) for one issue or one issue with a checklist; pass repo/title/labels as JSON and pipe the ready body on stdin
   - use [scripts/create-linked-set.mjs](scripts/create-linked-set.mjs) for a small linked ticket set; each issue entry must already include its final `body`, and the script only creates issues then backfills related links after URLs exist
   - add created issues to the project with [scripts/add-to-project.mjs](scripts/add-to-project.mjs) only when project placement is requested and the target project is known
8. Return a compact summary:
   - title or ticket set
   - repo
   - project target if used
   - labels
   - created URLs
   - blockers if any destination step stopped the write path

## Rules

- Never tie trigger logic to voice notes specifically.
- Always produce a task contract before GitHub writes.
- Ask only for the smallest blocker: repo, project placement, labels, project mapping, or missing write intent.
- Treat issue-body template choice as optional. If nobody asked for a special shape, use the default template as a manual writing pattern.
- Keep decomposition boring and implementation-friendly.
- Prefer one ticket unless the work clearly wants a split.
- Prefer a checklist over multiple tickets when separate tracking would not add real value.
- If the request is still fuzzy, narrow the scope before creating external artifacts.
- If project mapping is ambiguous, never guess silently: ask one short clarification, split cross-project work cleanly, or stay `draft-only`.
- Creating GitHub artifacts is an external write; do it only when the user has clearly asked for tracked-ticket creation.
- Project placement is optional: if repo is known but project placement is unknown, prefer issue creation without guessing a board, or stop at `draft-only` if board placement was part of the explicit ask.
- Do not drift into Vikra research, KM/Polengi stages, or execution orchestration; this skill stops once the GitHub artifacts are shaped and created.
- Do not promise general update flows that the shipped scripts do not implement.
- Scripts in this skill are transport-only. They must not render templates or substitute placeholders.
