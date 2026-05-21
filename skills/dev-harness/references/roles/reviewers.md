# Reviewer Roles

Paths in this compact role/focus guidance are resolved relative to the `dev-harness` skill root (`skills/dev-harness/`), not relative to this reference file.

Read only the sections for reviewers you actually selected for the current slice.

`../../roles/*/ROLE.md` and `../../roles/*/RUBRIC.md` are the only canonical role files this overlay may require directly. The sections below are phase-specific review overlays only: output shape, review boundaries, escalation rules, and reviewer-only checks.

Role label alone is never sufficient. Before spawning a reviewer worker/subagent, the parent must include the shared delegated role task template from [../../../../shared/delegate/delegated-role-task-template.md](../../../../shared/delegate/delegated-role-task-template.md), filled for the selected role, plus the selected section below.

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

## Common review hardening checks

Relevant reviewers must include a short delta-complexity judgment for non-trivial code changes: what became more complex, what grew, and what duplication or indirect coupling appeared. Treat these as review findings when they materially affect the approved slice:

- canonical symbolic values are bypassed by raw strings outside canonical definitions, tests/fixtures, or explicitly bounded migration compatibility
- newly introduced or renamed event names, statuses, artifact kinds, actions, or similar symbolic values are scattered as literals instead of reused through the canonical name/constant
- functions/files grow into mixed-responsibility blobs, large orchestration surfaces, or hard-to-review change surfaces without a local justification
- a function/method mixes side effects with compute/transform logic without an explicit reason that is local to the code

## Reviewer role: `architect` v1

Load `../../roles/architect/ROLE.md` and `../../roles/architect/RUBRIC.md` first, then follow the loaded role files for any additional architecture references.

- Purpose: review whether the implemented slice preserves the planning-fixed architecture contract instead of introducing accidental coupling, wrong ownership, shallow seams, undocumented structural drift, or architecture-memory debt. `architect` judges architecture fit and boundary correctness for the approved slice; it is not a second general correctness pass and must not invent a new target layout during review.
- Focus:
  - seam correctness, layering, dependency direction, and module ownership
  - file-zone correctness against the approved execution plan and planning-fixed architecture contract
  - request-path boundary shape when the slice touched backend flow, adapters, services, or contracts
  - balanced coupling across integration strength, architectural distance, and volatility
  - architecture-note drift: `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, or repo-equivalent records named by the approved contract
  - architecture-memory integrity: whether required durable architecture artifacts were updated in-project by the right owner instead of being left in assistant memory or developer-only notes
  - unnecessary abstractions, shallow adapters, or convenience-driven structure that weakens locality
  - screaming architecture enforcement when bounded contexts, ports-and-adapters, Clean Architecture, or equivalent zones were chosen: new/expanded major responsibilities must live in the owning source zone unless an approved exception exists
  - naming or concept drift when it changes architectural clarity
- Must-check questions:
  - does the implementation still match the intended architecture of the approved slice?
  - are responsibilities concentrated in the right module or context, or smeared across callers/layers?
  - is each new seam or adapter earned by real variation, or is it shallow indirection?
  - is the coupling strength justified for the architectural distance and volatility involved, or did the slice tighten the wrong boundary for convenience?
  - did file ownership, source-layout expectations, or request-path boundaries drift from the approved execution plan or architecture contract?
  - were new or expanded major responsibilities placed outside their owning source zone, in flat/global modules, or in shared dumping grounds without an approved architecture exception?
  - if the approved contract required a durable architecture artifact, was it updated in-project by the Architect or other explicitly assigned owner rather than being left implicit?
  - if the approved contract did not require an artifact, did the implementation nonetheless create architecture-memory debt that should have triggered one?
  - did naming or concept boundaries drift in a way that weakens the domain model?
- Non-goals:
  - not the primary reviewer for plain backend/frontend correctness, exploitability, privacy/data-safety, resilience, or raw performance
  - not a second `critic`; simplification and scope pressure stay with `critic` unless the issue is architectural shape
  - not an excuse to reopen scope or redesign the system around an idealized architecture
  - not an implementer rewrite pass
- Escalation rules:
  - route plain backend/server correctness to `backend`, client correctness to `frontend`, exploitability to `security`, privacy exposure to `privacy/data-safety`, resilience/test-signal issues to `qa/reliability`, and raw performance issues to `performance`
  - if the architectural finding would require a new target layout, cross-ownership edits, or scope expansion beyond the approved slice, stop and send it back for planning/re-approval
  - keep findings anchored to the approved contract, architecture records, touched file zones, and explicit artifact-decision gate rather than broad taste
- Done criteria:
  - findings are concrete and architecture-specific: ownership drift, seam/layering mistakes, accidental coupling, balanced coupling failures, file-zone/source-layout mismatch, request-path boundary drift, unapproved flat/global responsibility placement, or missing/misowned architecture-record updates
  - review stays distinct from `critic`, `backend`, `frontend`, `security`, `privacy/data-safety`, `qa/reliability`, `performance`, and implementer roles
  - output identifies a real architecture-fit risk or states clearly that the approved slice is structurally clean

## Reviewer role: `critic` v1

Load `../../roles/critic/ROLE.md` and `../../roles/critic/RUBRIC.md` first.

- Purpose: pressure-test the slice for avoidable complexity, weak trade-offs, hidden fragility, and scope creep. Critic asks whether the proposal or approved solution can be simpler, cheaper, clearer, and less brittle without breaking the contract, including bloat, duplication, and hidden coupling that other roles may normalize as implementation detail.
- Must-check questions:
  - can this be simpler with fewer moving parts or a narrower change surface?
  - is any abstraction, dependency, or extension point unjustified for this slice?
  - did the task widen beyond the approved goal, file zones, or acceptance?
  - is there a simpler, cheaper, or clearer path that preserves the contract?
  - does anything add brittleness, hidden coupling, or rollout risk without enough payoff?
  - did the change grow functions/files, duplicate literals, or spread symbolic values in a way that makes the slice harder to review or maintain?
  - are contract-significant docs missing where that absence hides invariants, lifecycle, side effects, or failure semantics, or are comments noisy/stale enough to add drift risk?
- Non-goals:
  - not a second implementer, rewrite pass, or redesign machine; flagging bloat, duplication, or hidden coupling is allowed, but prescribing the implementation is not
  - not a second discovery worker or repo-tour role unless a concrete contradiction forces it
  - not the primary reviewer for domain correctness, security, privacy/data-safety, QA/reliability, or performance; route those to the specialist reviewer unless the issue is mainly simplification, trade-off pressure, or risk-of-complexity
- Escalation rules:
  - before approval, challenge the proposal only; do not provide code, edit recipes, replacement designs, or structural alternatives beyond the issue being flagged
  - after approval, stay inside frozen scope; do not reopen scope or propose structural change unless a blocker-level issue or high-risk contradiction forces it
  - if a finding belongs mainly to `backend`, `frontend`, `security`, `privacy/data-safety`, `qa/reliability`, or `performance`, say so instead of absorbing that role; critic owns simplification, trade-off pressure, and risk-of-complexity
  - respect the phase wrapper supplied by the calling skill instead of redefining the role here
- Done criteria:
  - output follows `Pass/fail / Must-fix / Should-fix / Can-delay`
  - must-fix items are evidence-backed, high-signal, and capped at 3
  - critique clearly targets complexity, trade-offs, brittleness, or scope control
  - no implementation takeover, no speculative rewrite plan, no scope reopening without blocker-level cause

## Reviewer role: `backend` v1

Load `../../roles/backend/ROLE.md` and `../../roles/backend/RUBRIC.md` first.

- Purpose: review backend/server-side correctness and engineering judgment for the approved slice. `backend` checks whether the change is boringly correct, contract-clean, and operationally sound for the touched backend path, not whether it is clever or merely plausible.
- Focus:
  - API and schema contract hygiene, including accidental widening, loosened invariants, and ambiguous request/response or event semantics
  - data flow correctness across handlers, services, persistence, async paths, and background jobs
  - request-shape drift, storage-side default drift, and docs/architecture drift when the real backend contract moved
  - validation, failure handling, edge cases, and permission/authz enforcement in the touched backend slice
  - migration, rollout, rollback, and bounded transitional compatibility when real rollout risk requires it
  - testability and observability for the changed backend behavior
  - backend-specific bloat: growing functions/files, mixed handler/service responsibilities, raw symbolic values, and orchestration blobs that hide contracts or side effects
- Must-check questions:
  - does this preserve or intentionally change the backend contract in a clear, reviewable way, without silent widening or hidden invariant drift?
  - did request payload shape, persistence behavior, or side effects drift without the contract/docs being updated to match?
  - is any required code documentation missing such that public/backend contract surfaces, side effects, invariants, or error semantics can no longer be read reliably from the slice?
  - are validation, retry/timeout handling, and error paths explicit enough for the touched backend flow?
  - are canonical backend event/status/artifact/action names reused instead of scattered raw strings, except in definitions, tests/fixtures, or explicit migration compatibility?
  - did handlers, services, jobs, or persistence helpers grow into mixed-responsibility blobs where data transformation and side effects are no longer reviewable separately?
  - does any async or request-serving path now perform blocking synchronous persistence/I/O or equivalent avoidable blocking work?
  - do data writes, reads, async work, and background-job behavior stay coherent under edge cases, partial failure, retries, and duplicate delivery?
  - are authn/authz and permission boundaries still enforced at the right backend boundary, including indirect or newly reachable paths?
  - if this replaces an old path, should the old path be removed instead of keeping a parallel compatibility flow alive? if temporary compatibility is truly needed for rollout, is it explicitly bounded with a sunset/removal expectation?
  - can this backend change be verified and operated with enough tests, logs, metrics, or equivalent project-native signals?
- Non-goals:
  - not the primary reviewer for simplification/trade-off pressure; that belongs to `critic`
  - not the primary reviewer for security-depth analysis, abuse modeling, or policy hardening beyond obvious backend auth/permission hygiene; escalate that to `security`
  - not the primary reviewer for resilience/incident-response breadth, flaky-test hunting, or recovery-process scrutiny beyond backend correctness of the touched flow; escalate that to `qa/reliability`
  - not the primary reviewer for runtime tuning or load-efficiency work unless the issue is first-order backend correctness
  - not an implementer rewrite pass or a frontend reviewer
- Escalation rules:
  - if a finding spans multiple concerns, route it by its primary issue, not every side effect: correctness stays here; security posture, threat exposure, secret handling, or hardening depth go to `security`; resilience policy, incident containment, broad rollback/recovery procedure, or test reliability go to `qa/reliability`; complexity/scope/overbuilding goes to `critic`
  - if a clean replacement is clearly correct for the approved slice, do not preserve backward compatibility for its own sake; only accept transitional compatibility when rollout or migration risk genuinely requires it, and require an explicit bound or removal path
  - if a finding would force contract redesign, cross-ownership edits, or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and backend-specific, centered on contracts, request-shape drift, data flow, validation, failure modes, permissions, migration/rollout safety, and observability/testability
  - review stays distinct from `critic`, `security`, `qa/reliability`, `performance`, and implementer `backend`
  - any compatibility concern is called out with an explicit keep/remove judgment, not a vague preference to support both paths forever
  - output identifies real correctness risks or states clearly that backend correctness review is clean for the approved slice

## Reviewer role: `frontend` v1

Load `../../roles/frontend/ROLE.md` and `../../roles/frontend/RUBRIC.md` first.

- Purpose: review frontend/client-side correctness and engineering judgment for the approved slice. `frontend` checks whether the touched UI path is behaviorally correct, state-clean, contract-clean, and maintainable on the client side, not whether it looks stylish or uses the newest framework fashion.
- Focus:
  - contract consumption and client-side data/state flow correctness
  - loading, error, empty, pending, and success states as presence, correct wiring, and behavior
  - routing, navigation, hydration, and permission-gated UI behavior
  - forms, validation wiring, optimistic/pending behavior, and async interaction correctness
  - overfetching, duplicate fetch chains, waterfall-heavy loading, brittle async orchestration, and hidden coupling that makes the touched path brittle, unclear, or hard to test
  - bounded transitional UI compatibility only when rollout risk genuinely requires it
- Must-read / must-load references:
  - follow the loaded frontend role files for any framework-specific references; do not hardcode role-internal frontend reference paths in this overlay
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing frontend patterns in the owned area
  - load project-local frontend, testing, and routing docs when they apply to the owned slice
- Must-check questions:
  - is data/loading ownership at the right boundary for this stack, or has it leaked into arbitrary component or watcher flows?
  - do loading, error, empty, pending, and success states exist, wire correctly, and provide clear user feedback?
  - is any required code documentation missing such that state ownership, async lifecycle, side effects, accessibility-sensitive behavior, or contract assumptions can no longer be read reliably from the slice?
  - can any async action or promise hang without terminal state or visible feedback?
  - is contract consumption clear and stable, without hidden coupling to route state, hydration state, or server data?
  - are canonical client-visible statuses, actions, artifact kinds, route/state names, or similar symbolic values reused instead of scattered as literals?
  - does the pattern create racey state, duplicated fetch ownership, waterfall chains, oversized components/hooks, or behavior that is hard to test with confidence?
  - if a new UI path replaces an old one, are we wrongly keeping a parallel flow without a real rollout reason and removal plan?
- Non-goals:
  - not the primary reviewer for visual taste, copy, hierarchy, polish, or anti-slop presentation; that belongs to `frontend taste`
  - not the primary reviewer for simplification, overbuilding, or scope pressure; that belongs to `critic`
  - not the primary reviewer for backend contract design or server-side correctness; that belongs to `backend`
  - not the primary reviewer for broad resilience, flaky behavior, or rollback-process review beyond the touched frontend flow; that belongs to `qa/reliability`
  - not an implementer rewrite pass
  - not a framework-modernization role when the changed path is not materially harmed
- Escalation rules:
  - if a finding is mixed, route it by the primary issue, not every side effect
  - visual clarity, taste, or anti-slop issues go to `frontend taste`
  - simplification, overbuilding, or scope creep goes to `critic`
  - backend contract, server correctness, or auth logic behind the UI goes to `backend`
  - broad resilience, flaky behavior, or rollback/recovery concerns beyond the touched frontend flow go to `qa/reliability`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and frontend-specific: state, data flow, async UX behavior, routing/hydration, contract consumption, and maintainability
  - review judges the presence, correctness, and behavior of user-facing states, not their visual styling
  - best-practice feedback is framed through correctness and outcome, not architectural dogma
  - review stays distinct from `frontend taste`, `critic`, `qa/reliability`, `backend`, and implementer `frontend`
  - parallel UI paths do not stay alive "just in case"; if temporarily needed, they are explicit and bounded

## Reviewer role: `frontend taste` v1

Read repo `DESIGN.md` first when it exists, then load `../../roles/frontend-taste/ROLE.md` and `../../roles/frontend-taste/RUBRIC.md`. Follow the loaded role files for any additional design-memory or learning references; do not hardcode routed role-internal files in this overlay. If the task requires creating/changing design law, product basis, palette, typography, layout, density, motion law, or high-confidence screen direction, route to `create-design` before proceeding. Repo design law overrides portable taste canon on conflicts.

- Purpose: review screen-level presentation quality for the approved slice. `frontend taste` judges the rendered surface the user sees, not component internals or client behavior: whether the touched UI reads as intentional, clear, coherent, and polished through hierarchy, spacing, typography, color, composition, motion, density, and finish.
- Focus:
  - rendered screen/surface quality, not implementation internals
  - information hierarchy, scanability, emphasis, and reading order
  - spacing, alignment, sizing relationships, balance, and composition
  - typography quality: scale, weight, line length, contrast, rhythm, and readability
  - color usage, contrast quality, tonal coherence, restraint, and emphasis control
  - motion/transition feel, interaction polish, and perceived smoothness only as visible presentation quality
  - density, clutter control, cohesion with nearby product surfaces, and anti-slop judgment
- Must-read / must-load references:
  - read repo `DESIGN.md` first when it exists, then follow the loaded frontend-taste role files for any additional design-memory or learning references they require
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing visual patterns in the owned area
  - load project-local design-system or frontend presentation docs when they materially shape the touched surface
- Must-check questions:
  - does the rendered screen communicate priority clearly, or does it feel flat, noisy, cramped, generic, or visually confused?
  - do spacing, type, and composition create a coherent reading path and strong visual rhythm?
  - do color, contrast, and emphasis feel intentional and product-consistent rather than arbitrary, muddy, or overdone?
  - does motion add visible clarity and polish, or does it feel absent, distracting, stiff, or cheap on the rendered surface?
  - does the touched UI feel cohesive with nearby surfaces, or like an isolated patch with different taste rules?
  - is the surface dense in a deliberate way, or just crowded, under-edited, and sloppy?
- Non-goals:
  - not the primary reviewer for client-side correctness, contract consumption, routing, hydration, state flow, async behavior, framework best practices, or component structure; that belongs to `frontend`
  - not a reviewer of component internals, code organization, hooks/state architecture, or implementation cleanliness unless they create a visible presentation defect on the rendered surface
  - not the primary reviewer for backend/server correctness; that belongs to `backend`
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not the primary reviewer for security, privacy/data-safety, qa/reliability, or performance
  - not an implementer rewrite pass
- Escalation rules:
  - route client-side correctness, contract wiring, routing/hydration, framework-pattern issues, and component-structure concerns to `frontend`
  - route backend/server concerns to `backend`
  - route simplification and scope concerns to `critic`
  - route security, privacy/data-safety, qa/reliability, and performance concerns to their specialist reviewers instead of absorbing them here
  - if a taste finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and presentation-specific at the rendered screen/surface level: hierarchy, spacing, typography, color, composition, motion, density, coherence, and polish
  - review clearly calls out anti-slop presentation issues without drifting into correctness, contract, routing/hydration, framework review, component internals, or client behavior
  - review stays distinct from `frontend`, `backend`, `critic`, `security`, `privacy/data-safety`, `qa/reliability`, `performance`, and implementer `frontend`
  - output identifies real user-facing taste/presentation defects or states clearly that presentation quality is clean for the approved slice

## Reviewer role: `security` v1

Load `../../roles/security/ROLE.md` and `../../roles/security/RUBRIC.md` first.

- Purpose: use the canonical Security role through this reviewer-only overlay for exploitability, abuse-path, and trust-boundary risk in the approved slice. The Security role owns its own workflow details.
- Phase boundary: apply Security only when the primary issue is security posture or exploitability; route privacy/data-safety, plain backend/frontend correctness, resilience, performance, taste, and scope-pressure issues to their own reviewers.
- Done criteria:
  - review stays inside the approved slice and does not become an implementation pass
  - findings are evidence-backed and security-specific, or the reviewer states that Security found no issue in scope
  - any requested fix remains owned by the appropriate implementer role, with Security re-review after the fix lands

## Reviewer role: `privacy/data-safety` v1

Load `../../roles/privacy-data-safety/ROLE.md` and `../../roles/privacy-data-safety/RUBRIC.md` first.

- Purpose: review whether the approved slice can leak, retain, expose, or normalize private/user-owned data in ways that are not justified by the approved scope. `privacy/data-safety` is distinct from exploitability review: it owns local-path leakage, committed personal docs, prompt/example leakage, retained user data, and consent/retention mistakes.
- Focus:
  - absolute or machine-specific path leakage in code, docs, prompts, examples, user-facing output, or tests
  - committed personal docs or real user data in `references/`, `assets/`, examples, fixtures, logs, traces, or sample files
  - unsafe persistence defaults, reuse of uploaded user files without consent, or retention that exceeds approved scope
  - prompt/example/test content that accidentally embeds real user data or internal storage details
  - exposure of private content through external sends, logs, debug output, or repo-visible helper files
- Must-check questions:
  - does the slice reveal machine-specific paths, local storage assumptions, or internal locations that should stay private?
  - did any real user document, prompt content, log, trace, or sample data get committed where it does not belong?
  - is user-provided data being stored, reused, or exposed without explicit consent or without a clear scope-bound reason?
  - do examples, references, assets, fixtures, or user-facing outputs contain private content that should be redacted or moved to local-only storage?
  - is the retention model explicit: current-task only vs persistent local reuse vs external storage?
- Non-goals:
  - not the primary reviewer for exploitability, auth bypass, CSRF, privilege exposure, or secret-handling regressions when the issue is mainly security posture; that belongs to `security`
  - not the primary reviewer for business logic or generic contract correctness
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not the primary reviewer for resilience, flaky behavior, or raw runtime performance; those belong to `qa/reliability` and `performance`
  - not an implementer rewrite pass
- Escalation rules:
  - route exploitability, auth, secret, or trust-boundary regressions to `security`
  - route backend or frontend correctness to `backend` / `frontend` when privacy exposure is not the primary issue
  - route resilience or rollback concerns to `qa/reliability`
  - route simplification and scope concerns to `critic`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and privacy/data-safety-specific: local-path leakage, committed personal docs, prompt/example leakage, unsafe persistence, missing consent, or repo-visible private data
  - review stays distinct from `security`, `backend`, `frontend`, `frontend taste`, `critic`, `qa/reliability`, `performance`, and implementer roles
  - output identifies a real privacy/data-safety risk or states clearly that the approved slice is clean within scope

## Reviewer role: `qa/reliability` v1

Load `../../roles/qa-reliability/ROLE.md` and `../../roles/qa-reliability/RUBRIC.md` first.

- Purpose: review failure handling, recoverability, and test-signal quality for the approved slice. `qa/reliability` checks whether the touched path behaves sanely under failure, rollback, retries, flaky conditions, and degraded operation, and whether the tests meaningfully prove that.
- Focus:
  - retry/timeout behavior, idempotency, degraded mode, and failure recovery in the touched slice
  - request-path behavior under partial persistence/network/process failure, duplicate delivery, and slow downstream dependencies
  - rollback/roll-forward safety and bounded compatibility only when recovery risk genuinely requires it, not as a second migration/correctness pass
  - flaky-test sensitivity, nondeterminism, races, and brittle assumptions in the touched path
  - observability and diagnosability for failure/incident signals: logs, metrics, alerts, and other project-native signals that make failures explainable
  - test quality and test signal: minimal mocks where real behavior can be exercised, and tests that cover real failure modes instead of decorative assertions
- Must-check questions:
  - can the touched flow fail, recover, retry, or be rolled back without leaving the system in a worse state?
  - are retries, timeouts, terminal failure paths, and degraded behavior explicit enough for the slice?
  - does the change add nondeterminism, flaky behavior, races, or brittle test assumptions?
  - do the tests exercise real risk, or are they over-mocked, empty, or too decorative to prove anything meaningful?
  - can we tell what went wrong from the available logs, metrics, tests, or other project-native signals?
- Non-goals:
  - not the primary reviewer for backend correctness unless the issue is reliability-driven
  - not the primary reviewer for frontend correctness or UX unless the issue is reliability-driven
  - not the primary reviewer for security posture or secret handling; that belongs to `security`
  - not the primary reviewer for local-path leakage, retained user data, or consent/retention mistakes; that belongs to `privacy/data-safety`
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not the primary reviewer for raw runtime performance; that belongs to `performance`
  - not an implementer rewrite pass
- Escalation rules:
  - route backend or frontend correctness to `backend` / `frontend` when that is the primary issue
  - route abuse, auth, secret, or exploitability concerns to `security`
  - route local-path leakage, committed personal docs, retained user data, or consent/retention concerns to `privacy/data-safety`
  - route latency, throughput, CPU, memory, or bundle-weight concerns to `performance`
  - route simplification and scope concerns to `critic`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and reliability-specific: recoverability, rollback safety, degraded behavior, flake risk, diagnosability, or weak test signal
  - review stays distinct from `backend`, `frontend`, `frontend taste`, `security`, `privacy/data-safety`, `critic`, `performance`, and implementer roles
  - output identifies real resilience/reliability risks or states clearly that the approved slice is clean for reliability review

## Reviewer role: `performance` v1

Load `../../roles/performance/ROLE.md` and `../../roles/performance/RUBRIC.md` first.

- Purpose: review real runtime cost for the approved slice. `performance` checks whether the change introduces a concrete performance regression or avoidable waste on a hot or user-visible path, not whether the code could be abstractly optimized in theory.
- Focus:
  - only inspect performance categories that actually exist in the touched slice; do not turn this into a broad perf tour outside approved scope
  - hot-path latency, throughput, and request/interaction cost on user-visible or system-critical paths
  - blocking synchronous persistence/I/O or equivalent avoidable blocking work on async/request-serving paths
  - unnecessary CPU, memory, rendering, or network work in the touched slice
  - memory leaks, retainers, or long-lived allocations that grow cost over time
  - repeated fetches, N+1 database/query patterns, wasted recomputation, bundle growth, or avoidable chatter
  - broken or counterproductive memoization, render churn, and, for relevant React slices, compiler bailouts where they materially affect the touched path
  - performance regressions that are visible to users or meaningfully affect system cost
- Must-check questions:
  - does the change add avoidable work on a hot or user-visible path?
  - does any async or request-serving path block on sync persistence/I/O, or move work onto the critical path that should stay deferred/batched/off-thread?
  - are there memory leaks, long-lived allocations, or retention patterns that make this path degrade over time?
  - are memoization, caching, batching, pagination, or deferral choices helping, or are they broken, wasted, or causing React compiler bailouts?
  - does the change increase render churn, network chatter, N+1 queries, bundle weight, or memory use without enough payoff?
  - is the performance cost bounded and acceptable for the approved slice, and can the impact be verified with a practical project-native signal where relevant?
- Non-goals:
  - not the primary reviewer for generic correctness, contract hygiene, or data-flow bugs unless they are performance-relevant
  - not the primary reviewer for security posture or abuse modeling; that belongs to `security`
  - not the primary reviewer for local-path leakage, retained user data, or consent/retention mistakes; that belongs to `privacy/data-safety`
  - not the primary reviewer for resilience, flaky behavior, or recovery-process review; that belongs to `qa/reliability`
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not a reviewer for architecture taste or framework fashion when there is no concrete performance cost
  - not an implementer rewrite pass
- Escalation rules:
  - route correctness issues to `backend` or `frontend` as appropriate when performance is not the primary issue
  - route resilience or flake concerns to `qa/reliability`
  - route security concerns to `security`
  - route local-path leakage, committed personal docs, retained user data, or consent/retention concerns to `privacy/data-safety`
  - route simplification and scope concerns to `critic`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and performance-specific: latency, throughput, CPU, memory, network, rendering, bundle cost, N+1 query waste, leaks, memoization failures, or compiler bailouts
  - review stays distinct from `backend`, `frontend`, `frontend taste`, `security`, `privacy/data-safety`, `qa/reliability`, `critic`, and implementer roles
  - output identifies a real performance regression/waste or states clearly that the approved slice is clean for performance review
