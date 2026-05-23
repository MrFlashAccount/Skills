# Output Contract

Return one structured packet with these top-level fields exactly:

- `summary`
- `repo`
- `issue_url`
- `status`
- `implementer_owners`
- `execution_contract_basis`
- `branch_name`
- `pr_url`
- `change_summary`
- `verification_results`
- `review_handoff`
- `blockers`
- `warnings`
- `next_action`
- `issue_comment`

`status` allowed values:

- `blocked`
- `in_progress`
- `ready_for_review`

Conditional rules:

- If `status` is `blocked`, `blockers` must be non-empty.
- If `status` is `ready_for_review`, `verification_results` must be non-empty and `review_handoff` must be populated.

Field intent:

- `summary`: short execution outcome.
- `repo`: repo name or canonical repo identifier.
- `issue_url`: source issue/task URL, or empty string if none.
- `status`: current handoff state.
- `implementer_owners`: owner-to-zone map using only `backend` and `frontend`.
- `execution_contract_basis`: short reference to the approved research + execution-plan basis used for development.
- `branch_name`: working branch used or prepared for transport.
- `pr_url`: published PR URL when transport already supplied one; otherwise empty.
- `change_summary`: concise user-visible changes.
- `verification_results`: commands/checks run, results, notable gaps, and whether each delegated implementer satisfied loaded role material's additional, final-answer, or output requirements, or the `blocked` state if required role material could not be used.
- `review_handoff`: compact handoff for the separate review stage, including intended reviewer coverage, any review-sensitive hotspots, and when using shared templates, the reviewer handoff packet plus the role invocation packet that the orchestrator must pass to each reviewer. For architecture-sensitive work, include resolved proof obligations, deviations from the architecture contract, unresolved compatibility surfaces, and negative checks run.
- `blockers`: unresolved blockers that prevent safe progress. Keep this limited to concrete execution blockers, contradictions, or missing implementation-critical facts that survived earlier stages.
- `warnings`: non-blocking risks, follow-ups, or caveats.
- `next_action`: one explicit next step for the caller.
- `issue_comment`: transport-ready comment body another layer can persist.

`review_handoff` minimum shape:

- `reviewer_plan`: concise reviewer roster and scope from the approved execution plan
- `hotspots`: ordered list of files/areas that deserve close review attention
- `contract_gaps`: empty list when none; otherwise any remaining caveats the review stage should explicitly judge
- `resolved_proof_obligations`: architecture proof-map obligations satisfied, or empty when not applicable
- `architecture_contract_deviations`: deviations from Architect contract with approval/status, or empty when none
- `unresolved_compatibility_surfaces`: remaining wrappers/deprecated exports/aliases/legacy imports, or empty when none
- `negative_checks_run`: negative checks for forbidden imports/paths, deletion proof, compatibility absence, naming honesty, and schema/domain alignment, or empty when not applicable

Packet rules:

- Keep values concise and factual.
- Do not include raw agent transcripts.
- If work is still active, use `in_progress`.
- Use `ready_for_review` when code and verification are complete and the next correct step is the separate review stage.
- Do not imply that independent review already passed inside this packet.
