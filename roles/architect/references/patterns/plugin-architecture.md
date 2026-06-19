# Plugin Architecture

Use Plugin Architecture when controlled runtime/configuration-time extensibility is the point: a stable core contract lets optional implementations attach without rebuilding core policy or scattering environment conditionals through the application.

This is not the same as “we have an interface.” The architecture earns its weight when deployments, products, tenants, integrations, or third parties need different implementations behind one explicit extension contract.

## Core shape

- **Core**: owns the stable extension contract, lifecycle expectations, compatibility rules, and what plugins may not touch.
- **Plugin contract / extension point**: the narrow interface the plugin implements or registers against.
- **Plugin implementation**: optional module selected by configuration, discovery, dependency injection, manifest, registry, or runtime loading.
- **Plugin host / loader**: composition code that finds, validates, wires, orders, and isolates plugins.
- **Separated interface pressure**: the core knows the contract; concrete implementations can vary by runtime environment or deployment.

## Use it when

- Multiple runtime environments require different implementations of the same behavior.
- Deployment configuration should choose implementations without editing factory conditionals, rebuilding, or redeploying core code.
- Integrations or extensions vary independently of the core release cadence.
- The product intentionally supports optional capabilities, tenant-specific modules, partner integrations, local drivers, or third-party extensions.
- A growing set of factories or conditionals is already encoding environment-specific implementation choice.

## Anti-signals

- There is only one built-in implementation and no real pressure for alternate deployments.
- The “plugin” needs direct access to core internals because the extension contract is weak.
- A config file with class names would solve the problem, but the design invents discovery, lifecycle, sandboxing, and registries anyway.
- Every feature becomes a plugin to avoid making ownership decisions.
- Plugins are allowed to change core invariants, persistence shape, or dependency direction.

## Dependency rules

- Core defines the extension contract and owns plugin lifecycle semantics.
- Plugin implementations depend on the core contract; core policy does not depend on plugin implementation modules.
- Selection and wiring live in host/composition/configuration code, not scattered factory conditionals.
- Plugins may call only documented extension APIs. They must not import core internals, mutate core-owned state directly, or rely on private ordering side effects.
- Versioning, capability negotiation, or compatibility checks are required when plugins can be developed/released independently.

Binding checks:

- `must_not_import`: core modules must not import concrete plugin implementation modules.
- `must_not_reach`: plugins must not import undocumented core internals or persistence details.
- `negative_check`: adding/removing/replacing one plugin does not require changing core policy code.

## Source-layout rule

Good source shape:

- `core/` or owning context: extension contract, plugin-facing types, lifecycle rules.
- `plugins/<name>/` or package-level implementations: concrete extensions.
- `plugin-host`, `registry`, `loader`, `composition`, or config layer: implementation selection and validation.
- `tests/contract/`: shared contract tests each plugin implementation must pass.

Bad source shape:

- plugin implementations under core internals.
- `if env == test/prod/vendor` conditionals spread through multiple factories.
- one `plugins/` dumping ground with no owner, lifecycle, compatibility, or dependency rules.
- public extension interfaces that expose internal domain objects, ORM records, framework contexts, or mutable core state.

## Review checklist

- What extension pressure exists: deployments, tenants, integrations, third parties, or independent release cadence?
- What is the stable contract, and which side owns it?
- How are plugins selected: configuration, manifest, registry, DI, package discovery, runtime loading?
- What lifecycle does the host enforce: initialize, validate, execute, shutdown, migrate, order, capability check?
- Can implementation choice change without editing scattered factories or rebuilding core?
- What internal APIs are forbidden to plugins?
- Are contract tests shared across plugin implementations?
- Is this lighter as ports/adapters or configuration rather than a plugin architecture?

## Failure modes

- Conditional factory sprawl: every new deployment mode requires edits in several places.
- Extension without contract: plugins work only by importing internals and depending on accident.
- Over-pluginization: normal product modules become plugins, creating indirection with no independent variation.
- Loader as policy owner: the registry/loader starts deciding business behavior instead of only selecting implementations.
- Compatibility drift: plugins compile but fail at runtime because lifecycle/version/capability expectations are undocumented.
- Public exception creep: temporary plugin APIs become permanent compatibility surfaces with no owner or removal condition.

## Proof-map implications

For every plugin seam, Architect should record:

- concept and classification: core contract, plugin implementation, host/loader, compatibility surface
- owner module and allowed paths
- forbidden imports/reaches from core to plugin and plugin to internals
- runtime selection/composition entrypoint
- invariant: core policy is stable across plugin replacement
- compatibility decision: delete, keep temporarily, or public exception for legacy plugin APIs
- negative checks for plugin replacement/removal and contract-test coverage

## Sources

1. Martin Fowler, “Plugin” — https://martinfowler.com/eaaCatalog/plugin.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/plugin-architecture.md`

Only list this file if it was actually loaded.
