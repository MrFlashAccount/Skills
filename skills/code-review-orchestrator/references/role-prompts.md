# Role prompts

Use these as the per-role focus when spawning reviewers.

When a canonical reviewer label and repo folder spelling differ, load by repo path, not by mechanically derived label path:
- `frontend taste` -> `roles/frontend-taste`
- `privacy/data-safety` -> `roles/privacy-data-safety`
- `qa/reliability` -> `roles/qa-reliability`

## Shared rules for all roles
- Read the repo’s `AGENTS.md` first.
- Read the diff first, then the smallest relevant surrounding context.
- Prefer file:line evidence over abstract commentary.
- Keep answers short.
- For non-trivial code work, judge the slice adversarially against the approved contract and return an explicit binary pass/fail verdict.
- Return an explicit binary pass/fail verdict plus three buckets only: must-fix, should-fix, can-delay.
- If nothing is wrong, say that and stop.

## Critic
Load `roles/critic/ROLE.md` and `roles/critic/RUBRIC.md` first. In this skill, use them as a frozen-scope review-pressure adapter: check avoidable complexity, weak trade-offs, hidden fragility, and scope creep. Ask whether the slice can be simpler, narrower, or less brittle without breaking the approved contract.

## Backend
Load `roles/backend/ROLE.md` and `roles/backend/RUBRIC.md` first. In this skill, use them as a frozen-scope backend review adapter: check backend/server correctness, contracts, data flow, validation, edge cases, auth/permission hygiene, rollout/rollback safety, and observability/testability where relevant.

## Frontend
Load `roles/frontend/ROLE.md` and `roles/frontend/RUBRIC.md` first. In this skill, use them as a frozen-scope frontend review adapter: check frontend/client correctness, contract consumption, state/data flow, loading/error/empty/pending states, routing/hydration, async behavior, and maintainability. For React/Next.js slices, also load `vercel-react-best-practices`.

## Frontend taste
Load repo `DESIGN.md` first when it exists, then load `roles/frontend-taste/ROLE.md`, `roles/frontend-taste/RUBRIC.md`, `roles/frontend-taste/learnings/README.md`, and `roles/frontend-taste/learnings/shared-core.md`. Load one routed class file from `roles/frontend-taste/learnings/` only when repo design memory explicitly declares a project type. If the repo has no router or no declared type yet, do not guess a class: stop at `shared-core.md`, state that routing is undeclared, and lower confidence for class-specific taste judgments. Repo design law overrides portable taste canon on conflicts. In this skill, use them as a rendered-surface review adapter: check hierarchy, spacing, typography, color, composition, motion, density, and polish. Stay out of client correctness unless the issue is visibly manifested.

## Security
Load `roles/security/ROLE.md` and `roles/security/RUBRIC.md` first. In this skill, use them as an exploitability/trust-boundary review adapter: check secrets, auth, injection, unsafe parsing, external sends, data exposure, and privilege boundaries when the issue is exploitability or trust-boundary regression.

## Privacy / data-safety
Load `roles/privacy-data-safety/ROLE.md` and `roles/privacy-data-safety/RUBRIC.md` first. In this skill, use them as a private-content and retention-safety review adapter: check local-path leakage, committed personal docs, prompt/example leakage, retained user data, consent/retention mistakes, and repo-visible private content.

## QA / reliability
Load `roles/qa-reliability/ROLE.md` and `roles/qa-reliability/RUBRIC.md` first. In this skill, use them as a resilience-review adapter: check timeouts, retries, fallbacks, rollback/recovery behavior, observability/diagnosability, nondeterminism/flakiness, and test coverage/signal gaps.

## Performance
Load `roles/performance/ROLE.md` and `roles/performance/RUBRIC.md` first. In this skill, use them as a hot-path/resource review adapter: check hot paths, blocking IO, unnecessary work, repeated calls, large allocations, leaks, and avoidable latency.

## Merge rubric
- Must-fix: security issue, privacy/data-safety leak, data loss, approved-contract failure, or high-confidence functional bug.
- Should-fix: likely bug, weak test coverage, or significant maintainability issue.
- Can-delay: style, polish, or low-risk cleanup.
- If reviewers disagree, keep both sides and say what evidence is missing.
