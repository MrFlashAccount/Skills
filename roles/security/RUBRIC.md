# Security Rubric

Derived checklist for the Security role.

Use this as a compact checklist when a calling skill wants security judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Scope and evidence**: Is the approved slice clear, and are code/config claims backed by `file:line` evidence?
- **Language/framework detection**: Were the relevant languages/frameworks identified from manifests, imports, config, routes, and touched files?
- **Reference load**: Were `references/security-review-workflow.md` and all matching language/framework references loaded? If none matched, was that stated explicitly?
- **Secrets and credentials**: Are secrets, tokens, and sensitive auth materials protected from exposure?
- **Auth and privilege boundaries**: Do auth/authz checks, trust boundaries, and privilege assumptions hold under abuse, not just happy path?
- **Input and parsing safety**: Can attacker-controlled input trigger injection, unsafe parsing, unsafe deserialization, SSRF, path traversal, template injection, or execution risk?
- **External sends and exposure**: Does the slice leak or expose data across boundaries it should not cross?
- **Unsafe defaults/fallbacks**: Did the change weaken secure defaults, logging, CORS, cookies, sessions, redirects, embeds, or transport assumptions?
- **Reviewer boundary**: Are suggested fixes routed to `backend` or `frontend` instead of Security becoming the implementer?
- **Finding format**: Does each finding include severity, impact, `file:line`, reasoning, suggested fix, owner, and re-review trigger?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides how to apply it in the current phase.
