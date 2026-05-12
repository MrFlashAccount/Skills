# Existing-Codebase Improvement Checks

Use this file when `improve` work is really about deepening or tightening an existing codebase rather than choosing a net-new style.

## Vocabulary to use

Describe findings in terms of:
- module
- interface
- implementation
- seam
- adapter
- depth
- leverage
- locality

Avoid drifting back to vague words like "component," "service," or "boundary" unless the repo's own language requires them and you immediately map them to the terms above.

## What to inspect

### 1. Module depth
- Is the interface materially simpler than the implementation it hides?
- Does the module concentrate logic that would otherwise leak across callers?
- Is the module earning its keep, or acting as pass-through indirection?

Use the **deletion test**:
- if deleting the module makes complexity vanish, it was probably shallow
- if deleting it forces the same complexity to reappear across many callers, it was probably deep enough to keep

### 2. Seam quality
- Does the seam exist because something genuinely varies there?
- Is the seam located where the architecture needs change isolation, or where tests/framework pressure happened to make extraction easy?
- Are callers forced to know too much about ordering, error modes, or configuration because the seam is in the wrong place?

Rule:
- **one adapter = hypothetical seam**
- **two adapters = real seam**

A production adapter plus a meaningful test/in-memory adapter is usually the minimum proof that the seam is carrying real variation.

### 3. Interface discipline
- Treat the interface as the test surface.
- Prefer tests that exercise behavior through the interface instead of reaching into implementation details.
- If a proposed design only feels testable when tests bypass the interface, the module is probably too shallow or the seam is misplaced.

### 4. Locality and leverage
- Will the change make future edits land in one place instead of many?
- Will callers learn less while getting more behavior?
- Does the improvement reduce cross-file bouncing and ownership confusion?

A good improvement increases both:
- **leverage** for callers
- **locality** for maintainers

### 5. Context discipline
- Treat collocation as a hard architecture principle: related entities, ports, adapters, and local rules belong with the owning context unless there is a strong contrary constraint.
- Prefer local `CONTEXT.md` docs as the source of truth for important folders and bounded contexts.
- Put placement rules, allowed modules, forbidden dependencies, and ownership near the code they govern.
- Update the nearest relevant `CONTEXT.md` when a module's responsibility, ownership, or terminology changes.
- Do not collapse distributed context contracts back into one centralized folder dump or mirror them into central docs beyond indexing/discovery.

## Typical smells

- pass-through wrappers with no concentrated logic
- seams introduced for hypothetical future variation
- tests that only pass by mocking through multiple shallow layers
- domain language in `CONTEXT.md` drifting away from module names and interfaces
- large folders with no local ownership/placement contract
- central ports/adapters/entities areas that pull ownership artifacts away from their real context without a strong reason
- architecture docs that talk about contexts globally but leave local rules implicit

## How to use these checks

During source audit:
- identify shallow-module clusters
- identify missing or fake seams
- identify places where local `CONTEXT.md` docs should exist or should be updated

During option narrowing:
- explain whether the real need is `align`, selective deepening, or a bigger architecture shift

During review:
- challenge changes that add indirection without depth
- challenge context claims that are not backed by local ownership rules
- challenge migrations that create new seams without proving real adapters or real locality gains
