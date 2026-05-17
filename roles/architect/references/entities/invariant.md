# Invariant

An invariant is a truth that must remain stable while the slice changes: ownership boundaries, required behaviors, contract facts, or structural properties implementation must preserve.

If breaking it would require explicit re-approval or redesign, it is an invariant rather than a soft preference.

## Use it for

- must-preserve behaviors and contracts
- ownership truths that the slice must not destabilize
- structural properties that remain true after the change

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
