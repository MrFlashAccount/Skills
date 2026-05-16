# Frontend Rubric

Derived checklist for the Frontend role.

Use this as a compact checklist when a calling skill wants frontend implementation or review judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Contracts**: Does the client consume backend data/contracts correctly and defensively?
- **State/async flow**: Are state ownership, derived data, and async transitions clear and stable? Are independent promises started together and awaited only when needed?
- **States**: Are loading, pending, empty, success, error/retry, focus, disabled, and permission/partial-data states handled intentionally where applicable?
- **Routing/hydration**: Are route transitions and client/server boundary assumptions safe?
- **Component architecture**: Are user-facing files/components kept near the ~200 LOC pressure rule, with extraction seams or explicit justification for larger slices? Are data/orchestration and presentation split when that clarifies behavior?
- **State placement**: Is state kept in the narrowest correct home: local, lifted, context, URL, server/cache, or global client store?
- **Design-system discipline**: Does the UI use existing tokens, primitives, and scales instead of raw colors, arbitrary spacing, inline style escapes, mixed primitive systems, or local visual law?
- **Baseline UI red flags**: Are destructive actions confirmed, mobile viewport/fixed UI safe, errors near their fields/actions, paste allowed, data/text formatted robustly, z-index layered by scale, and empty states given one clear next action?
- **Interaction/motion craft**: If motion exists, does it have a purpose, frequency-appropriate duration, origin-aware behavior, interruptible transitions/gestures, reduced-motion fallback, and transform/opacity-first performance?
- **Performance mechanics**: Does the implementation avoid async waterfalls, broad/barrel imports, unnecessary render churn, duplicated client I/O, and repeated browser/JS hot-path work?
- **Maintainability**: Is UI logic localized and understandable instead of brittle or smeared?
- **Accessibility/interaction correctness**: Are native semantics preferred, controls keyboard reachable, accessible names present, focus visible, color not the only signal, and disabled/busy/error semantics correct?
- **Responsive QA**: Were touched layouts checked at relevant breakpoints, defaulting to 320/768/1024/1440 CSS px when no repo breakpoints are known?
- **Verification**: Do build/lint/typecheck/tests and, when relevant, screenshots, preview/browser smoke, axe/a11y, or keyboard walkthrough evidence prove the claimed frontend behavior?
- **Scope**: Is the role staying inside frontend correctness and implementation root causes rather than drifting into visual-taste symptom review or invention?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides whether it is using Frontend as an implementer, reviewer, or earlier-phase frontend judgment source.
