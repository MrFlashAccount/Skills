# Shared Templates

Reusable markdown templates for cross-skill planning artifacts.

This package is reference-only. It is not a runtime skill and must not contain `SKILL.md`.

## Templates

- [`research-packet-template.md`](research-packet-template.md): analytical research packet for business goal, problem, scope, options, risks, and architecture-ready open questions. No file-level implementation detail.
- [`architecture-proposal-template.md`](architecture-proposal-template.md): concise architecture proposal for entities, placement, ownership, dependencies, interfaces, integrations, and docs impact. No implementation plan or code.
- [`implementation-plan-template.md`](implementation-plan-template.md): concrete approved-work plan with ABCD workstreams, exact file zones, planning-level entities/methods, DoD, owners, reviewers, rollback, and full research/architecture appendices.
- [`implementer-handoff-template.md`](implementer-handoff-template.md): implementation prompt/handoff from the approved plan into the assigned implementer, including source-contract rows that must not be lost.
- [`reviewer-handoff-template.md`](reviewer-handoff-template.md): review prompt/handoff from implementation into reviewers, including required contract-trace and issue-closure verdicts.
- [`reviewer-to-implementer-handoff-template.md`](reviewer-to-implementer-handoff-template.md): narrow fix-pass prompt from reviewer findings back to implementers.

## Gate order

1. Research packet approved.
2. Architecture proposal approved.
3. Implementation plan approved.
4. Build the implementer handoff from the approved implementation plan.
5. Hand off to implementation-harness only after approval.
6. Hand off implementation results to reviewers.
7. If review fails, use the reviewer-to-implementer handoff for the fix pass.
