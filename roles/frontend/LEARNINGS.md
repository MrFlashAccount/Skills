# Frontend Learnings

Append-only durable memory for the Frontend role.

## How to use this file

Add short entries for:
- recurring failure modes
- clarified decision rules
- reusable heuristics
- corrections to earlier frontend behavior

Keep entries concrete and reusable.

## Entries

- For React performance work, separate visible symptoms from implementation causes: Frontend owns root-cause mechanics such as async waterfalls, bundle boundaries, render churn, client I/O duplication, and JS/DOM hot paths; Frontend-Taste owns whether the resulting experience feels polished.
- Keep portable React/browser mechanics framework-agnostic in this role. Avoid baking in framework-specific APIs or server/router concepts unless the caller provides that framework contract.
