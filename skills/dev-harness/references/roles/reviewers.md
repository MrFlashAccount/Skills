# Reviewer Roles

Paths in this compact role/focus guidance are resolved relative to the `dev-harness` skill root (`skills/dev-harness/`), not relative to this reference file.

Read only the sections for reviewers selected for the current slice.

`../../roles/*/ROLE.md` and `../../roles/*/RUBRIC.md` are the only canonical role files this overlay may require directly. The sections below are compact reviewer wrappers/focus blocks, not duplicated role rulebooks. Any role-internal references or learnings must be discovered by following instructions inside the loaded role files.

Role label alone is never sufficient. Before spawning a reviewer worker/subagent, the parent must include the shared delegated role task template from [../../../../shared/delegate/delegated-role-task-template.md](../../../../shared/delegate/delegated-role-task-template.md), filled for the selected role, plus the selected compact section below, the concrete review task/scope/verification expectations, and the output requirements from loaded role material.

Canonical reviewer roles:
- `critic`
- `architect`
- `backend`
- `frontend`
- `frontend taste`
- `security`
- `privacy/data-safety`
- `qa/reliability`
- `performance`

Canonical label -> role folder mapping when the spelling differs:
- `frontend taste` -> `../../roles/frontend-taste`
- `privacy/data-safety` -> `../../roles/privacy-data-safety`
- `qa/reliability` -> `../../roles/qa-reliability`

## Common reviewer prompt contract

Use the shared template plus the selected section below. Add only task-specific review context: repo guidance, approved execution contract or acceptance criteria, assigned/touched file zones, diff/PR target, non-goals, verification evidence, and requested output.

Do not paste reviewer rulebooks into parent prompts. Reviewer behavior lives in the selected `ROLE.md`, `RUBRIC.md`, and role-internal references loaded by the worker.

Apply the shared known-debt reviewer contract from [../../../../shared/review/known-debt-reviewer-contract.md](../../../../shared/review/known-debt-reviewer-contract.md) to every reviewer pass.

Inline this hostile-prior reviewer contract in every reviewer prompt: Start from a hostile prior: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent bugs. Any FAIL must be evidence-backed with file/function/line or equivalent precise location, and explain why existing tests/checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.

For non-trivial code changes, ask relevant reviewers for a short delta-complexity judgment when it is material to their role: newly scattered symbolic values, mixed-responsibility blobs, larger orchestration surfaces, duplicate literals, or side effects mixed with compute/transform logic.

## Reviewer role: `architect` v1

Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first, then follow the loaded role files for any additional architecture references before applying this frozen-scope architecture review overlay. Enforce the planning-fixed architecture contract, source-layout/owning-zone rules, seam/layering/dependency direction, artifact-decision gate, architecture-memory integrity, and contract/docs/source-record drift checks. Do not invent a new target layout during review; if a finding requires redesign, cross-ownership edits, or scope expansion, send it back for planning/re-approval.

## Reviewer role: `critic` v1

Load `../../roles/critic/ROLE.md` and `../../roles/critic/RUBRIC.md` first, then follow the loaded role files for any additional references before applying this frozen-scope review-pressure overlay. Check avoidable complexity, weak trade-offs, hidden fragility, scope creep, duplicated values, needless abstractions, and maintenance risk. Keep must-fix items evidence-backed and bounded; do not take over implementation or reopen scope without blocker-level cause.

## Reviewer role: `backend` v1

Load `../../roles/backend/ROLE.md` and `../../roles/backend/RUBRIC.md` first, then follow the loaded role files for any additional references before applying this frozen-scope backend review overlay. Check backend/server correctness, API/schema contract hygiene, request-shape or persistence drift, data flow, validation, edge cases, auth/permission hygiene, rollout/rollback safety, observability/testability, and bounded compatibility where real rollout risk requires it.

## Reviewer role: `frontend` v1

Load `../../roles/frontend/ROLE.md` and `../../roles/frontend/RUBRIC.md` first, then follow the loaded role files for any additional frontend references before applying this frozen-scope frontend review overlay. Check frontend/client correctness, contract consumption, state/data ownership, loading/error/empty/pending/success states, routing/hydration, async terminal states, form/interaction behavior, and maintainability. Route visual presentation issues to `frontend taste`.

## Reviewer role: `frontend taste` v1

Read repo `DESIGN.md` first when it exists, then load `../../roles/frontend-taste/ROLE.md` and `../../roles/frontend-taste/RUBRIC.md`. Follow the loaded role files for any additional design-memory or learning references; do not hardcode role-internal files in this overlay. Use this as a rendered-surface review overlay for hierarchy, spacing, typography, color, composition, motion, density, coherence, and polish. Stay out of client correctness unless the issue is visibly manifested; route design-law creation/change to `create-design`.

## Reviewer role: `security` v1

Load `../../roles/security/ROLE.md` and `../../roles/security/RUBRIC.md` first, then follow the loaded role files for any additional references before applying this reviewer-only overlay for exploitability, abuse paths, and trust-boundary risk in the approved slice. Route privacy/data-safety, plain backend/frontend correctness, resilience, performance, taste, and scope-pressure issues to their own reviewers.

## Reviewer role: `privacy/data-safety` v1

Load `../../roles/privacy-data-safety/ROLE.md` and `../../roles/privacy-data-safety/RUBRIC.md` first, then follow the loaded role files for any additional references before applying this private-content and retention-safety review overlay. Check local-path leakage, committed personal docs or real user data, prompt/example/test leakage, unsafe persistence or reuse, consent/retention mistakes, external sends/logs/debug exposure, and repo-visible private content.

## Reviewer role: `qa/reliability` v1

Load `../../roles/qa-reliability/ROLE.md` and `../../roles/qa-reliability/RUBRIC.md` first, then follow the loaded role files for any additional references before applying this resilience-review overlay. Check retry/timeout behavior, idempotency, degraded mode, rollback/recovery, partial failure, duplicate delivery, observability/diagnosability, nondeterminism/flakiness, and whether tests prove real failure modes with useful signal.

## Reviewer role: `performance` v1

Load `../../roles/performance/ROLE.md` and `../../roles/performance/RUBRIC.md` first, then follow the loaded role files for any additional references before applying this hot-path/resource review overlay. Check only performance categories present in the approved slice: hot-path latency, throughput, blocking I/O, CPU/memory/render/network waste, leaks, repeated work, N+1 patterns, bundle growth, memoization/render churn, and user-visible or system-cost regressions.
