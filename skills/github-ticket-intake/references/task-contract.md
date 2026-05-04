# Task Contract

Use this before drafting or creating any GitHub ticket or project artifact.

## Contract

- Raw request:
- Repo target:
- GitHub owner:
- Intent class: artifact-only / workflow-placement / workflow-handoff
- Project placement required: yes/no
- Board or project target:
- Single ticket, checklist ticket, or ticket set:
- Task title or titles:
- Summary:
- Problem to solve:
- Desired outcome:
- In-scope:
- Out-of-scope:
- Labels:
- Priority:
- Checklist or ticket split:
- Issue body template to read manually:
- Final issue body or bodies:
- Acceptance criteria:
- Risks:
- Open questions:
- Cross-links needed between tickets:
- Write mode: draft-only / write-ready
- Destination blockers:

## Rules

- The contract must be understandable without the original long voice note or chat dump.
- The title should be concrete enough to become an issue title as-is.
- Classify whether the ask wants only a GitHub artifact or wants the work placed into normal tracked ownership.
- If one ticket is enough, prefer one ticket.
- Prefer one ticket with a checklist before splitting into multiple tickets.
- Split into multiple tickets only when the work clearly benefits from separate tracked units.
- Template choice is optional. Default to the skill's standard template unless the user or repo convention wants a different issue-body shape.
- Read templates from `templates/`, but fill the markdown body yourself. Do not ask scripts to render placeholders.
- Research-program shaping such as Vikra research is out of scope here.
- If the repo or board target is unknown, stop at `draft-only`.
- If the request mixes multiple unrelated outcomes, split it into separate task candidates before writing anything.
- If the user wants writes now, confirm that the result is creation-oriented rather than an unsupported update flow.
- Board/taskflow/process wording should normally be read as workflow-placement intent, not plain issue-only intent.
- If workflow-placement intent is present and a default repo/project mapping exists, treat project placement as required.
- If workflow-placement intent is present and mapping is missing or ambiguous, do not silently fall back to issue-only creation.
- If the wording implies "put this into the workflow", classify it as `workflow-handoff` after create + board placement unless the user clearly wants draft-only.
- If project mapping is ambiguous, never guess silently.
- If one dominant project is likely but not certain, ask one short clarification before writing.
- If the work is genuinely cross-project, prefer a coordination ticket plus linked project tickets, or a small linked ticket set across projects.
- If no confident project mapping exists, stay `draft-only` and surface the mapping gap explicitly.

## Output

Return a short package with:
- issue-title candidate or ticket set
- one-paragraph summary
- final issue body or bodies
- checklist or split
- labels and board target
- blockers or missing GitHub context
