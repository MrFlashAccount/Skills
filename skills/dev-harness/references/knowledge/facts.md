# Facts

Append durable facts about repos, code paths, conventions, IDs, and stable decisions.

Format:
- YYYY-MM-DD — title: note

- 2026-04-23 — dev-harness routing: simple one-file/low-risk fixes should take the short path; multi-file, ambiguous, or risky code work should use the full pipeline.
- 2026-04-23 — dev-harness review loop: for full-pipeline tasks, run subagents first, then a review/report stage, then feed fixes back for up to 3 iterations.
- 2026-04-23 — dev-harness critic role: the critic should challenge complexity and ask whether the solution can be simpler, cheaper, or more optimized.
- 2026-04-23 — code-review-orchestrator alignment: review output should also support iterative re-review loops when the user wants up to 3 passes.
- 2026-04-23 — review mandate: every code task keeps a review gate; simple fixes get the lightest review, not no review.
- 2026-04-23 — orchestration-only rule: even simple fixes should be routed through at least one subagent; the harness itself should not do the coding manually.
- 2026-04-23 — two critic stages: `dev-harness` owns the pre-implementation critic/debate, while `code-review-orchestrator` is the post-implementation review gate.
- 2026-04-23 — approval gate clarification: after discovery/proposal, dev-harness must pause and wait for explicit user approval (`ПОДТВЕРЖДАЮ` or equivalent) before any edits.
