# Plugin Architecture

Use plugin architecture when controlled extensibility is the point: the core owns a stable extension contract and optional modules attach through that contract without reaching into core internals.

## Use it when

- the product needs multiple optional extensions, integrations, or third-party customization points
- the extension seam must stay stable while implementations vary independently

## Anti-signals

- calling something a plugin when there is only one built-in implementation and no extension pressure
- exposing core internals because the extension contract was never made explicit

## Sources

1. Martin Fowler, "Plugin" — https://martinfowler.com/eaaCatalog/plugin.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add it to the final role evidence loaded list as:

- `roles/architect/references/patterns/plugin-architecture.md`

Only list this file if it was actually loaded.
