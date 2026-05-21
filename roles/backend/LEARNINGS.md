# Backend Learnings

Append-only durable memory for the Backend role.

## How to use this file

Add short entries for:
- recurring failure modes
- clarified decision rules
- reusable heuristics
- corrections to earlier backend behavior

Keep entries concrete and reusable.

## Entries

- 2026-05-12 — non-enumerable persistence ids: Prefer UUIDs or similarly non-enumerable identifiers for persisted backend domain/security entities, especially auth, session, user-facing, cross-boundary, or externally referenced records. Avoid incremental/autoincrement IDs by default because they leak ordering/cardinality and encourage enumeration assumptions. Use incremental IDs only with a clear technical reason or for strictly internal/local tables where enumeration risk is irrelevant. “Early prototype” is not enough justification by itself.

## Final role evidence

When this learning file is actually loaded, include this `LEARNINGS.md` in final role evidence.
