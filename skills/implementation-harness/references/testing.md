# Testing

Verification should be minimal but real.

- Prefer targeted tests, lint, typecheck, build, or project-native checks for the touched slice.
- Name what ran, what passed, what failed, and what was not run.
- If an external contract matters, include one evidence source: docs, fixture, sample, or runtime check.
- Do not claim completion without at least one meaningful verification step unless blocked by environment or missing dependencies.

Escalate to `blocked` when:

- required verification cannot run and the gap makes the result unsafe
- the approved slice depends on a missing contract detail
- the repo state prevents isolated implementation or review

Record non-blocking gaps under `warnings` and `verification_results`.
