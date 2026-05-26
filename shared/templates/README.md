# Shared Templates

Reusable markdown templates for cross-skill planning artifacts and worker output formats.

This package is reference-only. It is not a runtime skill and must not contain `SKILL.md`.

## Template role

In workflow descriptors, treat these files as output templates: they describe the expected artifact or answer shape a worker returns. Prompt/input templates remain separate under the consuming workflow's `input.template` paths.

## Templates

- [`research-packet-template.md`](research-packet-template.md): analytical research packet for business goal, problem, scope, options, risks, and architecture-ready open questions. No file-level implementation detail.
- [`architecture-proposal-template.md`](architecture-proposal-template.md): concise architecture proposal for entities, placement, ownership, dependencies, interfaces, integrations, and docs impact. No implementation plan or code.
- [`implementation-plan-template.md`](implementation-plan-template.md): concrete approved-work plan with ABCD workstreams, exact file zones, planning-level entities/methods, DoD, owners, reviewers, rollback, and generic source appendices.
- [`implementer-handoff-template.md`](implementer-handoff-template.md): implementation handoff packet for an assigned slice, including source-of-truth context, todo checklist, contract rows, evidence expectations, and output fields.
- [`reviewer-handoff-template.md`](reviewer-handoff-template.md): review handoff packet with source-of-truth context, implementation evidence, review checklist, contract-trace rows, and verdict fields.
- [`review-verdict-template.md`](review-verdict-template.md): compact critic/reviewer worker output for review gates, with verdict, evidence, findings, and transition output.
- [`reviewer-to-implementer-handoff-template.md`](reviewer-to-implementer-handoff-template.md): narrow fix-pass packet from reviewer findings back to implementers, with source-of-truth context, todo checklist, must-fix gap rows, and verification expectations.

## Usage notes

- These files define artifact formats only; they do not define orchestration, worker spawning, or approval-gate process.
- Add or remove source appendix sections to fit the artifact being prepared.
- Keep role loading, delegated-worker invocation, and harness-specific sequencing in the consuming skill or process docs, not in these templates.
