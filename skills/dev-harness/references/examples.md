# Canonical Examples

Use these only as routing/eval sanity checks. Do not cargo-cult them into broad default behavior.

## 1) Tiny one-file bug fix

- Task: one obvious low-risk fix in one file
- Class: `tiny`
- Proposal: 3-4 bullets
- Implementers: one narrow `backend` or `frontend`
- Review: one reviewer chosen by primary risk

## 2) Multi-file backend slice

- Task: contract + handler + persistence change with rollout risk
- Class: `non-trivial`
- Read first: `task-contract.md`
- Implementers: one `backend`, or multiple `backend` owners only if file zones are fully non-overlapping
- Contract extras: name request-path impact, contract touchpoints, and docs/architecture notes that must stay aligned
- Review: always `staff backend`; add `performance` when the touched path is user-visible/hot or can block on sync storage/network/process work; add `qa/reliability` when retries/timeouts/recovery/duplicate-delivery semantics materially change; add `security` only when exploitability/auth/trust-boundary risk is primary

## 3) Frontend correctness plus visual quality

- Task: user-facing UI slice with both behavior risk and presentation quality risk
- Class: `non-trivial`
- Implementers: one `frontend`
- Review: `staff frontend` for correctness and `frontend taste` for presentation quality; keep the two passes separate

## 4) Post-auth security pass

- Task: auth/apps behavior exists and the question is exploitability or security regression
- Class: usually `non-trivial`
- Implementers: none if review-only; otherwise the smallest implementer set needed for the approved fix
- Review: `security`
- Expected focus: auth bypass, CSRF/cookie/session, open redirects, iframe/embed/sandbox, admin-only exposure, unsafe defaults, trust-boundary leaks

## 5) Privacy / data-safety pass

- Task: the slice touches local files, resumes/CVs, prompts/examples, logs/traces, retained user data, machine-specific paths, or user-data persistence rules
- Class: usually `non-trivial` even if the edit is small
- Review: `privacy/data-safety`
- Expected focus: absolute/local path leakage, committed personal docs, prompt/example leakage, unsafe persistence defaults, missing consent, and repo-visible private data
- Extra guard: run `scripts/check_sensitive_surface.py` and include the output in the review brief

## 6) QA / reliability pass

- Task: failures, rollback/recovery, degraded behavior, flaky/racey paths, or weak tests are the main concern
- Review: `qa/reliability`
- Expected focus: retries, timeouts, idempotency, degraded mode, diagnosability, minimal-mock test signal, non-decorative tests

## 7) Performance hot-path pass

- Task: user-visible latency, hot-path waste, memory growth, N+1 queries, or render churn is the main concern
- Review: `performance`
- Expected focus: real regressions/waste in the touched slice only, including blocking sync persistence/I/O on async request paths, not generic optimization advice

## 8) Complex or multi-zone review

- Task: risky, ambiguous, or multi-zone work where one reviewer is unlikely to be enough
- Review path: use `code-review-orchestrator`
- Still choose reviewers by primary risk; do not fan out just because multiple roles exist
