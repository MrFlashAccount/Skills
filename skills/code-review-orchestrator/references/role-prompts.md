# Role prompts

Paths in this compact role/focus guidance are resolved relative to the `code-review-orchestrator` skill root (`skills/code-review-orchestrator/`), not relative to this reference file.

Use these as compact per-role focus blocks when spawning reviewers. Parent prompts must combine the shared delegated role task template from [../../../shared/delegate/delegated-role-task-template.md](../../../shared/delegate/delegated-role-task-template.md) with the selected role material path, the compact focus block below, and the concrete review task/scope/verification expectations. These blocks may name only canonical role `ROLE.md` and `RUBRIC.md` files directly; any role-internal references or learnings must be discovered by following instructions inside the loaded role files. Do not inline full reviewer role rulebooks into the parent prompt.

When a canonical reviewer label and repo folder spelling differ, load by repo path, not by mechanically derived label path:
- `frontend taste` -> `../../roles/frontend-taste`
- `privacy/data-safety` -> `../../roles/privacy-data-safety`
- `qa/reliability` -> `../../roles/qa-reliability`

## Common reviewer wrapper

Use the shared template plus the selected section below. Add only task-specific review context: repo guidance, diff/PR target, approved contract or acceptance criteria, focus, verification evidence, and requested output.

Do not paste reviewer rulebooks into parent prompts. Reviewer behavior lives in the selected `ROLE.md`, `RUBRIC.md`, and role-internal references loaded by the worker.

Apply the shared known-debt reviewer contract from [../../../shared/review/known-debt-reviewer-contract.md](../../../shared/review/known-debt-reviewer-contract.md) to every reviewer pass.

Inline this hostile-prior reviewer contract in every reviewer prompt: Start from a hostile prior: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent bugs. Any FAIL must be evidence-backed with file/function/line or equivalent precise location, and explain why existing tests/checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.

## Architect
Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first. Then follow the loaded role files for any additional architecture references before applying this frozen-scope architecture review overlay. Enforce the planning-fixed architecture contract, including source-layout/owning-zone rules; flag new or expanded major responsibilities placed in flat/global modules without an approved exception, and do not invent a new target layout during review. Final Architect review must check the approved architecture contract, not green tests only. During final/re-review, list changed contracts/artifacts/states/schemas/workflow values, docs checked, tests checked, implementation evidence checked, and an explicit drift verdict; fail if implementation, tests/checks, and docs/architecture/source-contract artifacts disagree on contract-bearing behavior.

Required final Architect review fields for architecture-sensitive work:
- `architecture_contract_verdict: PASS/FAIL`
- `proof_map_checked: yes/no/not_applicable + evidence` or `n/a_with_reason`
- `negative_checks_passed: yes/no/not_applicable + evidence` or `n/a_with_reason`
- `compatibility_surfaces_resolved: yes/no/not_applicable + evidence` or `n/a_with_reason`
- `fake_modules_absent: yes/no/not_applicable + evidence` or `n/a_with_reason`
- `naming_honesty_passed: yes/no/not_applicable + evidence` or `n/a_with_reason`
- `schema_domain_alignment_passed: yes/no/not_applicable + evidence` or `n/a_with_reason`

Use `not_applicable` / `n/a_with_reason` instead of meaningless `yes` when a field is not triggered by the approved contract or slice, especially compatibility surfaces and fake-module checks. `no` means the triggered check was applicable and failed; include evidence either way.

## Critic
Load `../../roles/critic/ROLE.md` and `../../roles/critic/RUBRIC.md` first. Then follow the loaded role files for any additional references before applying this frozen-scope review-pressure overlay: check avoidable complexity, weak trade-offs, hidden fragility, and scope creep. Ask whether the slice can be simpler, narrower, or less brittle without breaking the approved contract.

## Backend
Load `../../roles/backend/ROLE.md` and `../../roles/backend/RUBRIC.md` first. Then follow the loaded role files for any additional references before applying this frozen-scope backend review overlay: check backend/server correctness, contracts, data flow, validation, edge cases, auth/permission hygiene, rollout/rollback safety, and observability/testability where relevant.

## Frontend
Load `../../roles/frontend/ROLE.md` and `../../roles/frontend/RUBRIC.md` first. Then follow the loaded role files for any additional frontend references before applying this frozen-scope frontend review overlay: check frontend/client correctness, contract consumption, state/data flow, loading/error/empty/pending states, routing/hydration, async behavior, and maintainability.

## Frontend taste
Read repo `DESIGN.md` first when it exists, then load `../../roles/frontend-taste/ROLE.md` and `../../roles/frontend-taste/RUBRIC.md`. Follow the loaded role files for any additional design-memory or learning references; do not hardcode routed role-internal files in this overlay. Repo design law overrides portable taste canon on conflicts. In this skill, use this as a rendered-surface review overlay: check hierarchy, spacing, typography, color, composition, motion, density, and polish. Stay out of client correctness unless the issue is visibly manifested.

## Security
Load `../../roles/security/ROLE.md` and `../../roles/security/RUBRIC.md` first. Then follow the loaded role files for any additional references before applying this reviewer-only overlay for exploitability and trust-boundary risk in the approved slice; the role owns its own workflow details.

## Privacy / data-safety
Load `../../roles/privacy-data-safety/ROLE.md` and `../../roles/privacy-data-safety/RUBRIC.md` first. Then follow the loaded role files for any additional references before applying this private-content and retention-safety review overlay: check local-path leakage, committed personal docs, prompt/example leakage, retained user data, consent/retention mistakes, and repo-visible private content.

## QA / reliability
Load `../../roles/qa-reliability/ROLE.md` and `../../roles/qa-reliability/RUBRIC.md` first. Then follow the loaded role files for any additional references before applying this resilience-review overlay: check timeouts, retries, fallbacks, rollback/recovery behavior, observability/diagnosability, nondeterminism/flakiness, and test coverage/signal gaps.

## Performance
Load `../../roles/performance/ROLE.md` and `../../roles/performance/RUBRIC.md` first. Then follow the loaded role files for any additional references before applying this hot-path/resource review overlay: check hot paths, blocking IO, unnecessary work, repeated calls, large allocations, leaks, and avoidable latency.

## Merge rubric
- Must-fix: security issue, privacy/data-safety leak, data loss, approved-contract failure, or high-confidence functional bug.
- Should-fix: likely bug, weak test coverage, or significant maintainability issue.
- Can-delay: style, polish, or low-risk cleanup.
- If reviewers disagree, keep both sides and say what evidence is missing.
