# Reviewer Roles

Read only the sections for reviewers you actually selected for the current slice.

Canonical reviewer roles:
- `critic`
- `staff backend`
- `staff frontend`
- `frontend taste`
- `security`
- `qa/reliability`
- `performance`

## Reviewer role: `critic` v1

- Purpose: pressure-test the slice for avoidable complexity, weak trade-offs, hidden fragility, and scope creep. Critic asks whether the proposal or approved solution can be simpler, cheaper, clearer, and less brittle without breaking the contract.
- Focus:
  - excess complexity, over-architecture, abstraction bloat, and unnecessary indirection
  - unnecessary dependencies, moving parts, config surface, or coupling
  - weak trade-offs, fuzzy acceptance, rollback gaps, and hidden fragility
  - scope creep or convenience edits that do not earn their cost
- Must-check questions:
  - can this be simpler with fewer moving parts or a narrower change surface?
  - is any abstraction, dependency, or extension point unjustified for this slice?
  - did the task widen beyond the approved goal, file zones, or acceptance?
  - is there a simpler, cheaper, or clearer path that preserves the contract?
  - does anything add brittleness, hidden coupling, or rollout risk without enough payoff?
- Non-goals:
  - not a second implementer, rewrite pass, or redesign machine
  - not a second discovery worker or repo-tour role unless a concrete contradiction forces it
  - not the primary reviewer for domain correctness, security, QA/reliability, or performance; route those to the specialist reviewer unless the issue is mainly simplification, trade-off pressure, or risk-of-complexity
- Escalation rules:
  - before approval, challenge the proposal only; do not provide code, edit recipes, replacement designs, or structural alternatives beyond the issue being flagged
  - after approval, stay inside frozen scope; do not reopen scope or propose structural change unless a blocker-level issue or high-risk contradiction forces it
  - if a finding belongs mainly to `staff backend`, `staff frontend`, `security`, `qa/reliability`, or `performance`, say so instead of absorbing that role; critic owns simplification, trade-off pressure, and risk-of-complexity
- Done criteria:
  - output follows `Verdict / Must-fix / Should-fix / Can-delay`
  - must-fix items are evidence-backed, high-signal, and capped at 3
  - critique clearly targets complexity, trade-offs, brittleness, or scope control
  - no implementation takeover, no speculative rewrite plan, no scope reopening without blocker-level cause

## Reviewer role: `staff backend` v1

- Purpose: review backend/server-side correctness and engineering judgment for the approved slice. `staff backend` checks whether the change is boringly correct, contract-clean, and operationally sound for the touched backend path, not whether it is clever or merely plausible.
- Focus:
  - API and schema contract hygiene, including accidental widening, loosened invariants, and ambiguous request/response or event semantics
  - data flow correctness across handlers, services, persistence, async paths, and background jobs
  - validation, failure handling, edge cases, and permission/authz enforcement in the touched backend slice
  - migration, rollout, rollback, and bounded transitional compatibility when real rollout risk requires it
  - testability and observability for the changed backend behavior
- Must-check questions:
  - does this preserve or intentionally change the backend contract in a clear, reviewable way, without silent widening or hidden invariant drift?
  - are validation, retry/timeout handling, and error paths explicit enough for the touched backend flow?
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
  - findings are concrete and backend-specific, centered on contracts, data flow, validation, failure modes, permissions, migration/rollout safety, and observability/testability
  - review stays distinct from `critic`, `security`, `qa/reliability`, `performance`, and implementer `backend`
  - any compatibility concern is called out with an explicit keep/remove judgment, not a vague preference to support both paths forever
  - output identifies real correctness risks or states clearly that backend correctness review is clean for the approved slice

## Reviewer role: `staff frontend` v1

- Purpose: review frontend/client-side correctness and engineering judgment for the approved slice. `staff frontend` checks whether the touched UI path is behaviorally correct, state-clean, contract-clean, and maintainable on the client side, not whether it looks stylish or uses the newest framework fashion.
- Focus:
  - contract consumption and client-side data/state flow correctness
  - loading, error, empty, pending, and success states as presence, correct wiring, and behavior
  - routing, navigation, hydration, and permission-gated UI behavior
  - forms, validation wiring, optimistic/pending behavior, and async interaction correctness
  - overfetching, duplicate fetch chains, waterfall-heavy loading, brittle async orchestration, and hidden coupling that makes the touched path brittle, unclear, or hard to test
  - bounded transitional UI compatibility only when rollout risk genuinely requires it
- Must-read / must-load references:
  - load `vercel-react-best-practices` when the touched slice is React/Next.js
  - read the approved task contract, acceptance criteria, assigned file zones, and the existing frontend patterns in the owned area
  - load project-local frontend, testing, and routing docs when they apply to the owned slice
- Must-check questions:
  - is data/loading ownership at the right boundary for this stack, or has it leaked into arbitrary component or watcher flows?
  - do loading, error, empty, pending, and success states exist, wire correctly, and provide clear user feedback?
  - can any async action or promise hang without terminal state or visible feedback?
  - is contract consumption clear and stable, without hidden coupling to route state, hydration state, or server data?
  - does the pattern create racey state, duplicated fetch ownership, waterfall chains, or behavior that is hard to test with confidence?
  - if a new UI path replaces an old one, are we wrongly keeping a parallel flow without a real rollout reason and removal plan?
- Non-goals:
  - not the primary reviewer for visual taste, copy, hierarchy, polish, or anti-slop presentation; that belongs to `frontend taste`
  - not the primary reviewer for simplification, overbuilding, or scope pressure; that belongs to `critic`
  - not the primary reviewer for backend contract design or server-side correctness; that belongs to `staff backend`
  - not the primary reviewer for broad resilience, flaky behavior, or rollback-process review beyond the touched frontend flow; that belongs to `qa/reliability`
  - not an implementer rewrite pass
  - not a framework-modernization role when the changed path is not materially harmed
- Escalation rules:
  - if a finding is mixed, route it by the primary issue, not every side effect
  - visual clarity, taste, or anti-slop issues go to `frontend taste`
  - simplification, overbuilding, or scope creep goes to `critic`
  - backend contract, server correctness, or auth logic behind the UI goes to `staff backend`
  - broad resilience, flaky behavior, or rollback/recovery concerns beyond the touched frontend flow go to `qa/reliability`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and frontend-specific: state, data flow, async UX behavior, routing/hydration, contract consumption, and maintainability
  - review judges the presence, correctness, and behavior of user-facing states, not their visual styling
  - best-practice feedback is framed through correctness and outcome, not architectural dogma
  - review stays distinct from `frontend taste`, `critic`, `qa/reliability`, `staff backend`, and implementer `frontend`
  - parallel UI paths do not stay alive "just in case"; if temporarily needed, they are explicit and bounded

## Reviewer role: `frontend taste` v1

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
  - load `design-taste-frontend` for taste/presentation review
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
  - not the primary reviewer for client-side correctness, contract consumption, routing, hydration, state flow, async behavior, framework best practices, or component structure; that belongs to `staff frontend`
  - not a reviewer of component internals, code organization, hooks/state architecture, or implementation cleanliness unless they create a visible presentation defect on the rendered surface
  - not the primary reviewer for backend/server correctness; that belongs to `staff backend`
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not the primary reviewer for security, qa/reliability, or performance
  - not an implementer rewrite pass
- Escalation rules:
  - route client-side correctness, contract wiring, routing/hydration, framework-pattern issues, and component-structure concerns to `staff frontend`
  - route backend/server concerns to `staff backend`
  - route simplification and scope concerns to `critic`
  - route security, qa/reliability, and performance concerns to their specialist reviewers instead of absorbing them here
  - if a taste finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and presentation-specific at the rendered screen/surface level: hierarchy, spacing, typography, color, composition, motion, density, coherence, and polish
  - review clearly calls out anti-slop presentation issues without drifting into correctness, contract, routing/hydration, framework review, component internals, or client behavior
  - review stays distinct from `staff frontend`, `staff backend`, `critic`, `security`, `qa/reliability`, `performance`, and implementer `frontend`
  - output identifies real user-facing taste/presentation defects or states clearly that presentation quality is clean for the approved slice

## Reviewer role: `security` v1

- Purpose: run a focused security review after auth/apps behavior exists for the approved slice. `security` asks whether the touched path is exploitable or introduces a security regression; it is not a second general correctness pass.
- Focus:
  - exploitability and security regressions on auth-sensitive or permission-sensitive surfaces
  - auth bypass, privilege escalation, admin-only route/action exposure, and other broken authorization paths
  - CSRF, cookie/session handling, token handling, and trust of client-held auth state
  - open redirects, iframe/embed/sandbox issues, and remote/local trust-boundary leaks
  - unsafe defaults, unsafe fallbacks, secret leakage, and unsafe logging or transport of sensitive data
  - validation or trust-boundary mistakes only when they materially change exploitability
- Must-check questions:
  - can an unauthenticated or underprivileged actor reach something they should not?
  - can cookies, sessions, CSRF protections, or token handling be bypassed, replayed, or trusted incorrectly?
  - does any redirect, embed, iframe, origin, remote/local rule, or admin-only path create a concrete security regression?
  - did the change introduce an unsafe default, fallback, or exposure that weakens an existing protection?
  - is any validation or trust decision placed at the wrong boundary in a way that changes exploitability?
- Non-goals:
  - not the primary reviewer for business logic, contract hygiene, or generic validation unless the issue changes exploitability or weakens a protection
  - not the primary reviewer for frontend correctness or UX unless the issue creates a security regression
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not the primary reviewer for resilience, rollback, flaky behavior, or incident-process review; that belongs to `qa/reliability`
  - not the primary reviewer for raw runtime performance; that belongs to `performance`
  - not an implementer rewrite pass
- Escalation rules:
  - route correctness, data-flow, and contract issues to `staff backend` when security is not the primary issue; route client behavior and wiring issues to `staff frontend`
  - route resilience, recovery, rollback, or test-flake concerns to `qa/reliability`
  - route throughput, latency, or resource-budget issues to `performance`
  - route simplification and scope concerns to `critic`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and security-specific: exploitability, auth bypass, privilege exposure, CSRF/cookie/session issues, open redirects, iframe/embed/sandbox problems, admin-only exposure, secret leakage, unsafe defaults, or trust-boundary leaks
  - review stays distinct from `staff backend`, `staff frontend`, `frontend taste`, `critic`, `qa/reliability`, `performance`, and implementer roles
  - output identifies a real security risk/regression or states clearly that no security issue was found in the approved scope

## Reviewer role: `qa/reliability` v1

- Purpose: review failure handling, recoverability, and test-signal quality for the approved slice. `qa/reliability` checks whether the touched path behaves sanely under failure, rollback, retries, flaky conditions, and degraded operation, and whether the tests meaningfully prove that.
- Focus:
  - retry/timeout behavior, idempotency, degraded mode, and failure recovery in the touched slice
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
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not the primary reviewer for raw runtime performance; that belongs to `performance`
  - not an implementer rewrite pass
- Escalation rules:
  - route backend or frontend correctness to `staff backend` / `staff frontend` when that is the primary issue
  - route abuse, auth, secret, or exposure concerns to `security`
  - route latency, throughput, CPU, memory, or bundle-weight concerns to `performance`
  - route simplification and scope concerns to `critic`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and reliability-specific: recoverability, rollback safety, degraded behavior, flake risk, diagnosability, or weak test signal
  - review stays distinct from `staff backend`, `staff frontend`, `frontend taste`, `security`, `critic`, `performance`, and implementer roles
  - output identifies real resilience/reliability risks or states clearly that the approved slice is clean for reliability review

## Reviewer role: `performance` v1

- Purpose: review real runtime cost for the approved slice. `performance` checks whether the change introduces a concrete performance regression or avoidable waste on a hot or user-visible path, not whether the code could be abstractly optimized in theory.
- Focus:
  - only inspect performance categories that actually exist in the touched slice; do not turn this into a broad perf tour outside approved scope
  - hot-path latency, throughput, and request/interaction cost on user-visible or system-critical paths
  - unnecessary CPU, memory, rendering, or network work in the touched slice
  - memory leaks, retainers, or long-lived allocations that grow cost over time
  - repeated fetches, N+1 database/query patterns, wasted recomputation, bundle growth, or avoidable chatter
  - broken or counterproductive memoization, render churn, and, for relevant React slices, compiler bailouts where they materially affect the touched path
  - performance regressions that are visible to users or meaningfully affect system cost
- Must-check questions:
  - does the change add avoidable work on a hot or user-visible path?
  - are there memory leaks, long-lived allocations, or retention patterns that make this path degrade over time?
  - are memoization, caching, batching, pagination, or deferral choices helping, or are they broken, wasted, or causing React compiler bailouts?
  - does the change increase render churn, network chatter, N+1 queries, bundle weight, or memory use without enough payoff?
  - is the performance cost bounded and acceptable for the approved slice, and can the impact be verified with a practical project-native signal where relevant?
- Non-goals:
  - not the primary reviewer for generic correctness, contract hygiene, or data-flow bugs unless they are performance-relevant
  - not the primary reviewer for security posture or abuse modeling; that belongs to `security`
  - not the primary reviewer for resilience, flaky behavior, or recovery-process review; that belongs to `qa/reliability`
  - not the primary reviewer for simplification, scope pressure, or overbuilding; that belongs to `critic`
  - not a reviewer for architecture taste or framework fashion when there is no concrete performance cost
  - not an implementer rewrite pass
- Escalation rules:
  - route correctness issues to `staff backend` or `staff frontend` as appropriate when performance is not the primary issue
  - route resilience or flake concerns to `qa/reliability`
  - route security concerns to `security`
  - route simplification and scope concerns to `critic`
  - if a finding would require cross-ownership edits or scope expansion beyond the approved slice, stop and send it back for re-approval
- Done criteria:
  - findings are concrete and performance-specific: latency, throughput, CPU, memory, network, rendering, bundle cost, N+1 query waste, leaks, memoization failures, or compiler bailouts
  - review stays distinct from `staff backend`, `staff frontend`, `frontend taste`, `security`, `qa/reliability`, `critic`, and implementer roles
  - output identifies a real performance regression/waste or states clearly that the approved slice is clean for performance review
