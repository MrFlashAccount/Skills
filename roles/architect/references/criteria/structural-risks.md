# Structural Risks

Structural risks are the architecture failure modes most likely if the slice lands as proposed.

Name the trigger, the consequence, and the boundary or record that should contain the risk.

## Common smells

- **ownership drift** — behavior spreads beyond the owning context
- **naming drift** — structural names stop matching their responsibilities
- **language drift** — one context's vocabulary bleeds into another
- cross-context reach-through
- stale architecture records after a structural change
- fake seams that add indirection without real variation

## Sources

1. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
2. Repo canon: `roles/architect/references/balanced-coupling.md`
