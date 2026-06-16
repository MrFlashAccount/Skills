# Review Policy

Read this before any review pass.

## Review gate

- Review is mandatory after every implementation pass.
- Documentation review is mandatory for non-trivial code slices.
- Default to one independent reviewer; use `code-review-orchestrator` for non-trivial, risky, multi-zone, or `sensitive-surface` work.
- If the slice is `sensitive-surface`, run `privacy/data-safety` review and include scanner output from the global `scripts/check_sensitive_surface.py` helper in the review brief.
- Keep `security` separate from `privacy/data-safety`: `security` owns exploitability/auth/trust-boundary regressions; `privacy/data-safety` owns local-path leakage, committed personal docs, prompt/example leakage, retained user data, and consent/retention mistakes.
- A worker may not review a slice it authored.
- Keep reviewer selection separate from implementer roles; do not treat review specialties as implementer labels.
- Start every reviewer/attacker pass from a hostile prior: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent bugs. Any FAIL must be evidence-backed with file/function/line or equivalent precise location, and explain why existing tests/checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.
- Choose reviewers from the canonical reviewer role set by task context.
- Backend slices that touch request-path, persistence, or async runtime behavior must include `backend` review.
- Add `performance` review when the touched backend path is user-visible, hot, or can block on sync storage/network/process work.
- Add `qa/reliability` review when retries, timeouts, duplicate-delivery, rollback, or degraded-mode behavior materially changes.
- Review external contract assumptions when the slice depends on a CLI, API, SDK, webhook, or similar integration.
- Require at least one contract evidence source: docs, captured sample, fixture, or local parser/runtime verification.
- For contract-bearing slices, final review must reconcile implementation, tests/checks, and docs/architecture/source-contract records. Stale or missing docs are blocker-level when they misstate user-visible/runtime behavior, workflow states, schemas, artifacts, symbolic lifecycle values, or review/process contracts.
- Check relevant assumption classes: payload shape/envelope, key names/field semantics, auth scopes/permissions/feature flags, nullability/empty states/optional fields, pagination/truncation/partial results, and dry-run-vs-live or mock-vs-real parity.
- Check review-gate quality drift: canonical symbolic values, duplicated literals, function/file growth, mixed responsibilities, and new indirect coupling.
- When event names, statuses, artifact kinds, action names, or similar symbolic values have canonical constants/names, flag new raw string use outside the canonical definition, tests/fixtures, or explicit migration compatibility.
- Collect findings into a short report.
- Feed in-scope fixes back to the relevant implementers without asking for fresh approval each pass.
- If a review finding expands scope, forces redesign, or surfaces a high-risk contradiction, stop and go back to the user for re-approval.
- For non-trivial work, run up to 3 review/fix passes; stop early when review is clean.
- For non-trivial work, the loop is explicit: `IMPLEMENT -> VALIDATE -> REVIEW -> FIX -> RE-VALIDATE -> RE-REVIEW`.
- After an in-scope fix pass, re-run validation before re-review, and prefer a fresh independent reviewer for re-review by default.
- Re-review after fixes must re-run the contract/docs drift check for any contract surface touched by the fix.
- If blockers remain after the max passes, stop as blocked and surface unresolved findings.
- `Sensitive-surface` work is not clean until the scanner is clean or explicitly dispositioned, and the relevant reviewer states either a concrete risk or that the approved slice is clean within scope.
- Absence of required file headers or language-appropriate code docs blocks closure when contract, lifecycle, side effects, invariants, or failure semantics would otherwise remain implicit.
- For trivial, internal, or otherwise obvious changes, documentation gaps should be treated as `should-fix` or `not-applicable`, not as an automatic blocker.

## Critic contract

Load `../../roles/critic/ROLE.md` as the canonical critic identity and `../../roles/critic/RUBRIC.md` as the compact checklist.

Use critic here as a short challenge role, not as a second implementer, second discovery worker, or vague smart-sounding narrator.

- Critic is the adversarial simplification/challenge reviewer, not a polite lightweight reviewer or the primary reviewer for correctness, security, privacy/data-safety, QA, performance, or redesign.
- Critic should aggressively challenge avoidable complexity, bloat, duplication, hidden coupling, unclear boundaries, overlarge files/functions, and cheaper/simpler alternatives, including small issues when they compound maintainability drift.
- Output shape: `Pass/fail / Must-fix / Should-fix / Can-delay`.
- Cap `Must-fix` at 3 items, ranked by severity.
- Every material finding should point to an artifact: acceptance criteria, proposal field, risk, file/line, test gap, or contradiction.
- Before approval, critic challenges the proposal only; no code-ish content and no implementation recipes.
- After approval, critic challenges the accepted result inside frozen scope; do not reopen design unless a blocker or high-risk contradiction forces it.
- This skill supplies the phase wrapper; the repo-level role stays phase-agnostic.
- Keep critique short and issue-focused.
