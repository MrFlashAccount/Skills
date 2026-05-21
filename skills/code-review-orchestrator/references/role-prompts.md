# Role prompts

Paths in this phase overlay are resolved relative to the `code-review-orchestrator` skill root (`skills/code-review-orchestrator/`), not relative to this reference file.

Use these as per-role focus overlays when spawning reviewers. These overlays may name only canonical role `ROLE.md` and `RUBRIC.md` files directly; any role-internal references or learnings must be discovered by following instructions inside the loaded role files.

When a canonical reviewer label and repo folder spelling differ, load by repo path, not by mechanically derived label path:
- `frontend taste` -> `../../roles/frontend-taste`
- `privacy/data-safety` -> `../../roles/privacy-data-safety`
- `qa/reliability` -> `../../roles/qa-reliability`

## Shared rules for all roles
- Read the repo’s `AGENTS.md` first.
- Role label is not a role contract. Before reviewing, load the canonical `ROLE.md` and `RUBRIC.md` named by your selected section below.
- Read the diff first, then the smallest relevant surrounding context.
- Prefer file:line evidence over abstract commentary.
- Keep answers short.
- The parent/orchestrator session owns delegation. You are the delegated reviewer worker/subagent for your assigned role; do not re-delegate the review or tell the parent to review it directly.
- For non-trivial code work, judge the slice adversarially against the approved contract and return an explicit binary pass/fail verdict.
- Return an explicit binary pass/fail verdict plus three buckets only: must-fix, should-fix, can-delay.
- If loaded role material defines final-answer requirements, satisfy them. If required role material cannot be loaded or final-answer requirements cannot be satisfied, return `blocked` instead of a review verdict.
- If nothing is wrong, say that and stop.

## Architect
Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first. Then follow the loaded role files for any additional architecture references before applying this frozen-scope architecture review overlay. Enforce the planning-fixed architecture contract, including source-layout/owning-zone rules; flag new or expanded major responsibilities placed in flat/global modules without an approved exception, and do not invent a new target layout during review. During final/re-review, list changed contracts/artifacts/states/schemas/workflow values, docs checked, tests checked, implementation evidence checked, and an explicit drift verdict; fail if implementation, tests/checks, and docs/architecture/source-contract artifacts disagree on contract-bearing behavior.

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
