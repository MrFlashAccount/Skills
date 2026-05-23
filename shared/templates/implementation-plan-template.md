# <Project/Issue> Implementation Plan — <Capability>

## Status

- Owner:
- Date:
- State: Draft | Ready for implementation approval | Approved | In progress | Done
- Based on research/context:
- Based on architecture proposal:

## Goal

<The concrete implementation outcome. Keep it tied to the approved context and architecture.>

## Work breakdown

| Workstream | Owner role | Files/zones | Add/change | Done when |
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

## Rollback plan

- <Smallest safe revert path.>
- <Data/config compatibility note, if applicable.>
- <How to detect rollback is needed.>

## Appendix: <source artifact name>

<Paste or link source-of-truth context needed by implementers/reviewers. Add more appendix sections as needed.>

## Template rules

- Be concrete and file-level: name file zones, classes, entities, functions, methods, configs, and docs at planning level.
- Use ABCD workstreams when helpful; keep roles/owners explicit.
- Include DoD, reviewer roles, rollback, and any source appendices needed to make the plan self-contained.
- Do not include code, diffs, command sequences, or process handoff instructions.
