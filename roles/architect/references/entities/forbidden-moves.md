# Forbidden Moves

Forbidden moves are explicit structural no-go changes the implementation must not make, even if they look locally convenient.

Their job is to prevent scope creep, boundary damage, and architecture drift during planning and implementation.

## Use it for

- dependency directions that must not be inverted
- ownership or placement changes that are out of scope
- record or seam changes that would require re-approval

## Do not use it for

- vague warnings with no concrete prohibition
- generic quality wishes like `keep it clean`

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
