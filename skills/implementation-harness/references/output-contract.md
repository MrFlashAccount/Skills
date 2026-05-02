# Output Contract

Return one structured packet with these top-level fields exactly:

- `summary`
- `repo`
- `issue_url`
- `status`
- `implementer_owners`
- `reviewer_plan`
- `branch_name`
- `pr_url`
- `change_summary`
- `verification_results`
- `blockers`
- `warnings`
- `next_action`
- `issue_comment`

`status` allowed values:

- `blocked`
- `in_progress`
- `ready_for_manual_review`

Conditional rules:

- If `status` is `blocked`, `blockers` must be non-empty.
- If `status` is `ready_for_manual_review`, `pr_url` must be non-empty.

Field intent:

- `summary`: short execution outcome.
- `repo`: repo name or canonical repo identifier.
- `issue_url`: source issue/task URL, or empty string if none.
- `status`: current handoff state.
- `implementer_owners`: owner-to-zone map using only `backend` and `frontend`.
- `reviewer_plan`: reviewers run, findings state, and any pending manual review ask.
- `branch_name`: working branch used or prepared for transport.
- `pr_url`: published PR URL when transport already supplied one; otherwise empty unless manual review requires it.
- `change_summary`: concise user-visible changes.
- `verification_results`: commands/checks run, results, and notable gaps.
- `blockers`: unresolved blockers that prevent safe progress.
- `warnings`: non-blocking risks, follow-ups, or caveats.
- `next_action`: one explicit next step for the caller.
- `issue_comment`: transport-ready comment body another layer can persist.

Packet rules:

- Keep values concise and factual.
- Do not include raw agent transcripts.
- If work is still active, use `in_progress`.
- If code and review are complete and waiting on human transport or merge flow, use `ready_for_manual_review`.
