# Balanced Coupling

Use this when deciding whether two modules, contexts, or layers should know about each other directly.

## Integration strength

Ask how strong the integration really is. Strong integration means the concepts change together, must stay semantically aligned, or are part of one meaningful flow. Weak integration means the relationship is incidental, convenience-driven, or mostly transport-shaped.

## Distance

Ask how far apart the participants are in the architecture: same module, same bounded context, neighboring context, cross-layer, or cross-system. Greater distance raises the bar for direct coupling.

## Volatility

Ask which side changes often, for what reasons, and whether those reasons are shared. If volatility is high and not shared, direct coupling becomes expensive quickly.

## Balance rule

Coupling is healthiest when integration strength is high enough to justify the architectural distance and volatility being absorbed. Strong/close/stable relationships can tolerate tighter coupling. Weak/distant/volatile relationships usually need a narrower contract, clearer seam, or no new connection at all.

## Abstraction-level caveat

Do not treat every direct dependency as a coupling mistake. A higher-level policy depending on a lower-level implementation detail is often the real problem. Check whether the abstraction level is correct before adding wrappers, adapters, or indirection.

## Practical interpretation

Use this lens to decide whether to:
- keep behavior concentrated in one owned module
- introduce or refuse a seam
- move logic closer to the concept it belongs to
- require an architecture artifact update so the chosen boundary is durable

## Common anti-patterns

- adding an adapter for a relationship that is actually close, stable, and single-owner
- directly coupling distant modules because wiring through a proper boundary feels slower
- pushing volatility from one context into another through shared helpers or pass-through abstractions
- creating architecture-memory debt by changing the boundary but leaving project architecture artifacts stale

## Final role evidence

When this reference is actually loaded, include this file in final role evidence.
