# Role prompts

Use these as the per-role focus when spawning reviewers.

## Shared rules for all roles
- Read the repo’s `AGENTS.md` first.
- Read the diff first, then the smallest relevant surrounding context.
- Prefer file:line evidence over abstract commentary.
- Keep answers short.
- For non-trivial code work, judge the slice adversarially against the approved contract and return an explicit binary pass/fail verdict.
- Return an explicit binary pass/fail verdict plus three buckets only: must-fix, should-fix, can-delay.
- If nothing is wrong, say that and stop.

## Critic
Check avoidable complexity, weak trade-offs, hidden fragility, and scope creep. Ask whether the slice can be simpler, narrower, or less brittle without breaking the contract.

## Staff backend
Check backend/server correctness: contracts, data flow, validation, edge cases, auth/permission hygiene, rollout/rollback safety, and observability/testability where relevant.

## Staff frontend
Check frontend/client correctness: contract consumption, state/data flow, loading/error/empty/pending states, routing/hydration, async behavior, and maintainability. For React/Next.js slices, also load `vercel-react-best-practices`.

## Frontend taste
Check rendered presentation quality: hierarchy, spacing, typography, color, composition, motion, density, and polish. Stay out of client correctness unless the issue is visibly manifested. Use the `design-taste-frontend` skill for this reviewer.

## Security
Check secrets, auth, injection, unsafe parsing, external sends, data exposure, and privilege boundaries when the issue is exploitability or trust-boundary regression.

## Privacy / data-safety
Check local-path leakage, committed personal docs, prompt/example leakage, retained user data, consent/retention mistakes, and repo-visible private content.

## QA / reliability
Check timeouts, retries, fallbacks, rollback/recovery behavior, observability/diagnosability, nondeterminism/flakiness, and test coverage/signal gaps.

## Performance
Check hot paths, blocking IO, unnecessary work, repeated calls, large allocations, leaks, and avoidable latency.

## Merge rubric
- Must-fix: security issue, privacy/data-safety leak, data loss, approved-contract failure, or high-confidence functional bug.
- Should-fix: likely bug, weak test coverage, or significant maintainability issue.
- Can-delay: style, polish, or low-risk cleanup.
- If reviewers disagree, keep both sides and say what evidence is missing.
