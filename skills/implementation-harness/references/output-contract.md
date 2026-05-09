# Output Contract

Return one structured packet with these top-level fields exactly:

- `summary`
- `repo`
- `issue_url`
- `status`
- `implementer_owners`
- `reviewer_plan`
- `review_gate`
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

Field intent:

- `summary`: short execution outcome.
- `repo`: repo name or canonical repo identifier.
- `issue_url`: source issue/task URL, or empty string if none.
- `status`: current handoff state.
- `implementer_owners`: owner-to-zone map using only `backend` and `frontend`.
- `reviewer_plan`: concise reviewer roster and scope, including who reviewed which pass.
- `review_gate`: structured review outcome with contract verdict and re-review freshness.
- `branch_name`: working branch used or prepared for transport.
- `pr_url`: published PR URL when transport already supplied one; otherwise empty. Keep this field present even when manual review is ready without a published PR.
- `change_summary`: concise user-visible changes.
- `verification_results`: commands/checks run, results, and notable gaps.
- `blockers`: unresolved blockers that prevent safe progress. Keep this limited to concrete execution blockers, contradictions, or missing implementation-critical facts that survived research.
- `warnings`: non-blocking risks, follow-ups, or caveats.
- `next_action`: one explicit next step for the caller.
- `issue_comment`: transport-ready comment body another layer can persist.

`review_gate` minimum shape:

- `contract_basis`: short reference to the approved contract / acceptance source used for review
- `status`: `pass` or `fail`
- `review_passes`: ordered list of review passes with reviewer label, outcome, and whether it was a re-review
- `fresh_reviewer_on_rereview`: `yes`, `no`, or `not_applicable`
- `freshness_notes`: empty string when not needed; otherwise explain why the same reviewer was reused

Packet rules:

- Keep values concise and factual.
- Do not include raw agent transcripts.
- If work is still active, use `in_progress`.
- If code and review are complete and waiting on human transport or merge flow, use `ready_for_manual_review`.
- Do not use `ready_for_manual_review` when only implementer self-report exists without validation plus independent review pass.
- Do not hide review pass/fail only inside prose fields; `review_gate.status` must carry the explicit verdict.
