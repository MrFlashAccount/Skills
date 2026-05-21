# Architecture Fit

Architecture fit asks whether the proposed change matches the repo's intended shape, or quietly bends the system into a different architecture.

## Use it when

- a change proposes new layers, seams, plugins, contexts, or records
- the easiest local solution might conflict with the existing architectural direction

## Check fit against

- existing architecture records
- current ownership model
- dependency rules already in force
- deployment/runtime shape the repo is actually using

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/criteria/architecture-fit.md`

Only list this file if it was actually loaded.
