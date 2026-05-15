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
- Planning: run an `architect` pass when file zones, dependency seams, request-path boundaries, or rollout shape are not already obvious
- Implementers: one `backend`, or multiple `backend` owners only if file zones are fully non-overlapping
- Contract extras: name request-path impact, contract touchpoints, and docs/architecture notes that must stay aligned
- Review: always `backend`; add `architect` when the main risk is bad seams, coupling, boundary drift, or wrong file ownership; add `performance` when the touched path is user-visible/hot or can block on sync storage/network/process work; add `qa/reliability` when retries/timeouts/recovery/duplicate-delivery semantics materially change; add `security` only when exploitability/auth/trust-boundary risk is primary

## 3) New repo/plugin or architecture-sensitive implementation slice

- Task: new project/repo/plugin setup or implementation work that can move ownership, seams, or durable architecture memory
- Class: `non-trivial` unless proven tiny and isolated
- Baseline: execution contract must include `project_baseline` and architecture artifact manifest before implementation handoff
- Architecture route: use DevHarness Architect gate for an implementation-slice structural contract; route full architecture process/package work to `create-architecture`
- Artifact owner: `architect` may implement approved architecture artifacts (`ARCHITECTURE.md`, meaningful source-zone `CONTEXT.md`, ADR/migration docs) and must stay separate from backend/frontend code owners and architect reviewer
- CONTEXT default: source-focused only for meaningful source ownership zones, not tests/scripts by default
- UI condition: if UI/frontend surface is material, record whether `DESIGN.md` exists, is required elsewhere, or is explicitly deferred/out of scope
- Proposal workspace: `.proposals/` only when explicitly requested, with `.proposals/<feature-slug>/{research.md,architecture.md,implementation.md}` and gitignore/publish hygiene

## 4) Frontend correctness plus visual quality

- Task: user-facing UI slice with both behavior risk and presentation quality risk
- Class: `non-trivial`
- Implementers: one `frontend`
- Review: `frontend` for correctness and `frontend taste` for presentation quality; keep the two passes separate

## 5) Post-auth security pass

- Task: auth/apps behavior exists and the question is exploitability or security regression
- Class: usually `non-trivial`
- Implementers: none if review-only; otherwise the smallest implementer set needed for the approved fix
- Review: `security`
- Expected focus: auth bypass, CSRF/cookie/session, open redirects, iframe/embed/sandbox, admin-only exposure, unsafe defaults, trust-boundary leaks

## 6) Privacy / data-safety pass

- Task: the slice touches local files, resumes/CVs, prompts/examples, logs/traces, retained user data, machine-specific paths, or user-data persistence rules
- Class: usually `non-trivial` even if the edit is small
- Review: `privacy/data-safety`
- Expected focus: absolute/local path leakage, committed personal docs, prompt/example leakage, unsafe persistence defaults, missing consent, and repo-visible private data
- Extra guard: run the global `scripts/check_sensitive_surface.py` helper and include the output in the review brief

## 7) QA / reliability pass

- Task: failures, rollback/recovery, degraded behavior, flaky/racey paths, or weak tests are the main concern
- Review: `qa/reliability`
- Expected focus: retries, timeouts, idempotency, degraded mode, diagnosability, minimal-mock test signal, non-decorative tests

## 8) Performance hot-path pass

- Task: user-visible latency, hot-path waste, memory growth, N+1 queries, or render churn is the main concern
- Review: `performance`
- Expected focus: real regressions/waste in the touched slice only, including blocking sync persistence/I/O on async request paths, not generic optimization advice

## 9) Complex or multi-zone review

- Task: risky, ambiguous, or multi-zone work where one reviewer is unlikely to be enough
- Review path: use `code-review-orchestrator`
- Add `architect` when the review must judge seams, layering, dependency choices, file-zone correctness, or request-path boundaries in addition to plain correctness
- Still choose reviewers by primary risk; do not fan out just because multiple roles exist
