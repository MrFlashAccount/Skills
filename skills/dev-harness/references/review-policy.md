# Review Policy

Read this before any review pass.

## Review gate

- Review is mandatory after every implementation pass.
- Default to one independent reviewer; use `code-review-orchestrator` for non-trivial, risky, multi-zone, or `sensitive-surface` work.
- If the slice is `sensitive-surface`, run `privacy/data-safety` review and include scanner output from the global `dev-harness/scripts/check_sensitive_surface.py` helper in the review brief.
- Keep `security` separate from `privacy/data-safety`: `security` owns exploitability/auth/trust-boundary regressions; `privacy/data-safety` owns local-path leakage, committed personal docs, prompt/example leakage, retained user data, and consent/retention mistakes.
- A worker may not review a slice it authored.
- Keep reviewer selection separate from implementer roles; do not treat review specialties as implementer labels.
- Choose reviewers from the canonical reviewer role set by task context.
- Backend slices that touch request-path, persistence, or async runtime behavior must include `staff backend`.
- Add `performance` review when the touched backend path is user-visible, hot, or can block on sync storage/network/process work.
- Add `qa/reliability` review when retries, timeouts, duplicate-delivery, rollback, or degraded-mode behavior materially changes.
- Review external contract assumptions when the slice depends on a CLI, API, SDK, webhook, or similar integration.
- Require at least one contract evidence source: docs, captured sample, fixture, or local parser/runtime verification.
- Check relevant assumption classes: payload shape/envelope, key names/field semantics, auth scopes/permissions/feature flags, nullability/empty states/optional fields, pagination/truncation/partial results, and dry-run-vs-live or mock-vs-real parity.
- Collect findings into a short report.
- Feed in-scope fixes back to the relevant implementers without asking for fresh approval each pass.
- If a review finding expands scope, forces redesign, or surfaces a high-risk contradiction, stop and go back to the user for re-approval.
- For non-trivial work, run up to 3 review/fix passes; stop early when review is clean.
- If blockers remain after the max passes, stop as blocked and surface unresolved findings.
- `Sensitive-surface` work is not clean until the scanner is clean or explicitly dispositioned, and the relevant reviewer states either a concrete risk or that the approved slice is clean within scope.

## Critic contract

Use critic as a short challenge role, not as a second implementer, second discovery worker, or vague smart-sounding narrator.

- Critic is the simplification/challenge reviewer, not the primary reviewer for correctness, security, privacy/data-safety, QA, performance, or redesign.
- Output shape: `Verdict / Must-fix / Should-fix / Can-delay`.
- Cap `Must-fix` at 3 items, ranked by severity.
- Every material finding should point to an artifact: acceptance criteria, proposal field, risk, file/line, test gap, or contradiction.
- Before approval, critic challenges the proposal only; no code-ish content and no implementation recipes.
- After approval, critic challenges the accepted result inside frozen scope; do not reopen design unless a blocker or high-risk contradiction forces it.
- Keep critique short and issue-focused.
