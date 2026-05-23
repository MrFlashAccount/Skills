# Shared Templates

Reusable markdown templates for cross-skill planning artifacts.

This package is reference-only. It is not a runtime skill and must not contain `SKILL.md`.

## Templates

- [`research-packet-template.md`](research-packet-template.md): analytical research packet for business goal, problem, scope, options, risks, and architecture-ready open questions. No file-level implementation detail.
- [`architecture-proposal-template.md`](architecture-proposal-template.md): concise architecture proposal for entities, placement, ownership, dependencies, interfaces, integrations, and docs impact. No implementation plan or code.
- [`implementation-plan-template.md`](implementation-plan-template.md): concrete approved-work plan with ABCD workstreams, exact file zones, planning-level entities/methods, DoD, owners, reviewers, rollback, and full research/architecture appendices.
- [`role-invocation-template.md`](role-invocation-template.md): explicit wrapper for passing the canonical delegated role invocation into a spawned worker. It points to [`../delegate/delegated-role-task-template.md`](../delegate/delegated-role-task-template.md) and tells the orchestrator which role material, task packet, and output contract to inject.
- [`implementer-handoff-template.md`](implementer-handoff-template.md): implementation handoff packet from the approved plan into the assigned implementer. It instructs the orchestrator to pass a filled role invocation instead of copying role instructions into the handoff.
- [`reviewer-handoff-template.md`](reviewer-handoff-template.md): review handoff packet from implementation into reviewers, including required contract-trace and issue-closure verdicts. It also requires a filled role invocation for each reviewer.
- [`reviewer-to-implementer-handoff-template.md`](reviewer-to-implementer-handoff-template.md): narrow fix-pass packet from reviewer findings back to implementers, again paired with a filled role invocation.

## Gate order

1. Research packet approved.
2. Architecture proposal approved.
3. Implementation plan approved.
4. Build the implementer handoff from the approved implementation plan.
5. For each spawned worker, fill and inject `role-invocation-template.md` with the canonical delegated role task template, selected role material path, concrete handoff packet, and output contract.
6. Hand off to implementation-harness only after approval.
7. Hand off implementation results to reviewers with reviewer handoff packets plus reviewer role invocations.
8. If review fails, use the reviewer-to-implementer handoff plus a fix-pass role invocation.
