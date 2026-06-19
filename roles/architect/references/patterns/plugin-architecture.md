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
- Versioning, capability negotiation, or compatibility checks are required when plugins can be developed/released independently. For first-party config-time plugins released with the core, a lighter bar is acceptable: validate the configured plugin name, required capability flags, and contract-test coverage at startup/CI.

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

Contract/loader lifecycle sketch:

- Contract: `ReportExporter` declares `id`, `capabilities`, `supports(format)`, and `export(report, sink)`; it receives only documented core values.
- Plugin: `plugins/pdf_exporter` implements the contract and declares manifest metadata such as version, capabilities, and default config.
- Loader: reads config/manifest, checks compatibility or first-party capability flags, orders plugins if needed, constructs dependencies, then registers implementations.
- Lifecycle: `discover -> validate -> initialize -> execute -> shutdown`; failures are reported at composition time unless the product explicitly supports degraded operation.

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

For every plugin seam, Architect should record the selective evidence needed for this pattern, not boilerplate for ordinary internal modules:

- concept and classification: core contract, plugin implementation, host/loader, compatibility surface
- owner module and allowed paths
- forbidden imports/reaches from core to plugin and plugin to internals
- runtime selection/composition entrypoint
- invariant: core policy is stable across plugin replacement
- compatibility decision: delete, keep temporarily, or public exception for legacy plugin APIs
- negative checks for plugin replacement/removal and contract-test coverage

## Repo-local synthesis and application notes

These notes make the pattern usable locally; source links are attribution and further reading, not prerequisites.

### Source pattern intent

A plugin links classes/modules during configuration rather than normal compilation/static dependency. The host/core exposes a separated interface or extension point; concrete implementations are found and attached through configuration, reflection/discovery, registry, dependency injection, manifest, package metadata, or runtime loading.

The point is not merely having an interface. The point is that implementation choice is intentionally separated from core policy and can vary without editing the core code that uses the extension.

### Separated interface pressure

The interface belongs on the stable side that needs to remain ignorant of concrete implementations. Implementations depend on that contract. The core should be able to call the contract without importing implementation modules. This preserves the direction: core contract inward, plugin implementation outward.

A plugin seam is useful when different deployments, environments, tenants, customers, partners, or release cadences need different behavior behind the same stable contract.

### Configuration-time versus runtime

Plugin architecture may mean runtime discovery/loading, but it does not have to. A first-party system may choose plugins at startup from config or a registry. A third-party ecosystem may need manifests, version checks, lifecycle hooks, and capability negotiation. The amount of machinery should match the independence and compatibility pressure.

If a config key choosing one of two built-in implementations solves the problem, do not invent a plugin ecosystem. If external authors or independent releases are real, document compatibility and lifecycle rules before relying on the seam.

### Host responsibilities

The plugin host/loader owns selection and wiring. It should:

- locate candidate implementations;
- validate that they implement the contract;
- check version/capability/config compatibility when needed;
- construct dependencies;
- register implementations in a predictable order when ordering matters;
- report startup/configuration errors clearly;
- shut plugins down or clean resources when the lifecycle requires it.

The loader must not become the business-policy owner. It selects and manages extensions; it should not decide domain behavior that belongs in the core or plugin contract.

### Contract responsibilities

The extension contract should be narrow enough that plugins do not need core internals, but rich enough to express the intended extension. It should define inputs, outputs, error expectations, lifecycle callbacks, capability flags, and what the plugin is forbidden to mutate or observe.

A weak contract causes plugins to import private internals, depend on ordering accidents, or mutate core state directly. Once plugin authors depend on a public method, field, event, or schema, it becomes a compatibility surface; temporary exceptions need an owner and removal condition.

### Contract tests

When multiple plugin implementations exist, shared contract tests are part of the architecture. Each implementation should prove it satisfies the same expectations. For third-party plugins, the contract test suite or compatibility checklist becomes a communication tool. For first-party config-time plugins, CI can run the same tests across built-in implementations.

### Practical consequences for repo docs

When this pattern is chosen, docs must preserve:

- why implementation choice must vary independently;
- where the stable extension contract lives;
- how implementations are discovered or selected;
- what lifecycle the host enforces;
- what compatibility/version/capability checks exist;
- what core internals plugins may not touch;
- which APIs are public compatibility surfaces;
- how contract tests prove replaceability;
- when the design should collapse back to config, ports/adapters, or a simple interface.

## Sources

1. Martin Fowler, “Plugin” — https://martinfowler.com/eaaCatalog/plugin.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/architect/references/patterns/plugin-architecture.md`

Only list this file if it was actually loaded.
