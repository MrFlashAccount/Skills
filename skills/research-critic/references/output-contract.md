# Output Contract

Return one structured packet with these sections.

## Required fields

- `summary`
- `goals`
- `non_goals`
- `constraints`
- `proposed_approach`
- `acceptance_criteria`
- `unresolved_blockers`
- `open_questions`
- `risks`
- `critic_findings`
- `missing_evidence`
- `verdict`
- `readiness_note`

## Field guidance

### `summary`
Short plain-language restatement of the task.

### `goals`
Concrete outcomes this phase is trying to enable.

### `non_goals`
What this phase explicitly does not cover.

### `constraints`
Real boundaries, dependencies, or limits already known.

### `proposed_approach`
The practical proposal. It may include sequencing, candidate file zones, architecture direction, and whether research should also lock a `design-test` artifact for UI-heavy work, but not implementation instructions.

### `acceptance_criteria`
What should be true for the task to be ready for approval or later implementation.

If UI/interaction design is materially part of the slice, this should state whether a `design-test` is required and what that artifact must cover: intended UI shape, required components, critical states/behavior, and detail expectations.

### `unresolved_blockers`
Concise top-level list of unresolved items that currently block approval, routing, or safe implementation start.

Use this for the short scannable "stop signs" a human or adapter should surface first.

Each item should be brief and direct. Prefer one line covering:
- what is unresolved or blocked
- why it matters now
- who or what must resolve it, if known

Keep this field easy to render as a standalone section, alert box, or checklist without extra interpretation.

### `open_questions`
Unresolved decisions or ambiguities that need clarification but are not necessarily immediate blockers.

Difference from `unresolved_blockers`:
- `unresolved_blockers` is the short must-see list for items actively blocking approval or start
- `open_questions` is the fuller backlog of unanswered questions, including non-blocking ones

### `risks`
Meaningful execution or design risks, not generic boilerplate.

### `critic_findings`
Short challenge findings against the proposal: weak points, unsupported assumptions, over-complexity, or hidden risk.

### `missing_evidence`
Facts or verification that would materially improve confidence.

Difference from `unresolved_blockers`:
- `missing_evidence` names absent proof, validation, or facts
- `unresolved_blockers` names the specific blocking takeaway after judging that missing evidence or ambiguity

### `verdict`
One of:
- `approve_as_is`
- `approve_with_changes`
- `needs_more_research`

### `readiness_note`
A short final recommendation that another layer can persist verbatim or adapt.

## Rules

- All fields must be present, even if some are empty lists.
- Keep the packet structured and adapter-friendly.
- If anything is unresolved enough to block approval or start, `unresolved_blockers` must be non-empty.
- Keep `unresolved_blockers` short and highly scannable so adapters or humans can surface it with minimal formatting.
- Do not hide critical blockers inside prose or only inside `open_questions` / `missing_evidence`.
