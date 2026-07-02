# Testing

Verification should be minimal but real.

- Prefer targeted tests, lint, typecheck, build, or project-native checks for the touched slice.
- Name what ran, what passed, what failed, and what was not run.
- If an external contract matters, include one evidence source: docs, fixture, sample, or runtime check.
- Do not claim completion without at least one meaningful verification step unless blocked by environment or missing dependencies.
- Treat verification failures caused by your own in-scope implementation changes as work to fix and rerun, not as blockers by themselves.

Escalate to `blocked` when:

- required verification cannot run and the gap makes the result unsafe
- fixing a failing check requires missing external input, permission, an approved-contract change, a redesign/plan decision, or unsafe repo/environment state
- the approved slice depends on a missing contract detail
- the repo state prevents isolated implementation or review

Record non-blocking gaps under `warnings` and `verification_results`.
