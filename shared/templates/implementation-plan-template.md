# <Project/Issue> Implementation Plan — <Capability>

## Status

- Owner:
- Date:
- State: Draft | Ready for implementation approval | Approved | In progress | Done
- Based on approved research packet:
- Based on approved architecture proposal:

## Goal

<The concrete implementation outcome. Keep it tied to the approved research and architecture.>

## Work breakdown

| Workstream | Owner role | Files-zones | Add/change | Done when |
| --- | --- | --- | --- | --- |
| A | <role> | <exact files, folders, modules, or zones> | <new/change/remove at planning level> | <observable completion signal> |
| B | <role> | <exact files, folders, modules, or zones> | <new/change/remove at planning level> | <observable completion signal> |
| C | <role> | <exact files, folders, modules, or zones> | <new/change/remove at planning level> | <observable completion signal> |
| D | <role> | <exact files, folders, modules, or zones> | <new/change/remove at planning level> | <observable completion signal> |

## Exact implementation tasks

### A. <Workstream name>

- In `<file/zone>`, add/change `<class/entity/function/method/config/doc section>` to <planning-level behavior>.
- Preserve <boundary/invariant/compatibility constraint>.

### B. <Workstream name>

- In `<file/zone>`, add/change `<class/entity/function/method/config/doc section>` to <planning-level behavior>.

### C. <Workstream name>

- In `<file/zone>`, add/change `<class/entity/function/method/config/doc section>` to <planning-level behavior>.

### D. <Workstream name>

- In `<file/zone>`, add/change `<class/entity/function/method/config/doc section>` to <planning-level behavior>.

## Definition of Done

- <Functional result is present.>
- <Approved architecture boundaries are preserved.>
- <Tests/checks/docs are updated as needed.>
- <No unrelated files or behavior changed.>
- <Review blockers resolved or explicitly accepted.>

## Reviewer plan

| Review role | Focus | Required evidence |
| --- | --- | --- |
| Architecture reviewer | Placement, ownership, dependencies, integration boundaries | <diff/docs/tests to inspect> |
| Implementation reviewer | Correctness, maintainability, edge cases | <diff/tests/manual check> |
| QA/reliability reviewer | Failure modes, regression risk, verification completeness | <test output/manual scenario> |
| Docs/process reviewer | User-facing or process documentation accuracy | <changed docs/README/reference> |

## Handoff to implementation-harness

After this plan is approved, hand off to implementation-harness with:

- Approved research packet
- Approved architecture proposal
- This implementation plan
- A filled [`implementer-handoff-template.md`](implementer-handoff-template.md) for each implementer owner
- Any explicit approvals, constraints, and non-goals
- Required reviewer roles and DoD

After implementation, hand off to reviewers with a filled [`reviewer-handoff-template.md`](reviewer-handoff-template.md). If review fails, send only the failed rows back with [`reviewer-to-implementer-handoff-template.md`](reviewer-to-implementer-handoff-template.md).

Do not start implementation-harness before approval.

## Rollback plan

- <Smallest safe revert path.>
- <Data/config compatibility note, if applicable.>
- <How to detect rollback is needed.>

## Appendix A: approved architecture proposal

<Paste the full approved architecture proposal here. Do not summarize.>

## Appendix B: approved research packet

<Paste the full approved research packet here. Do not summarize.>

## Template rules

- Be concrete and file-level: name file zones, classes, entities, functions, methods, configs, and docs at planning level.
- Use ABCD workstreams when helpful; keep roles/owners explicit.
- Include DoD, reviewer roles, rollback, and implementation-harness handoff.
- Include approved research and architecture below as full references.
- Do not include code, diffs, or command sequences.
- Do not start implementation-harness before this plan is approved.
