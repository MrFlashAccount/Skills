# Ubiquitous Language

Ubiquitous language is the shared, stable vocabulary a bounded context uses in code, docs, tests, and review.

Its job is to reduce translation drift between domain discussion and implementation.

## Use it when

- reviewers, docs, tests, and code need the same nouns and verbs to stay aligned
- ambiguous terms are already causing drift across modules or contexts

## Anti-signals

- keeping multiple near-synonyms because they sound nice
- mixing terms from different contexts as if they were interchangeable
- hiding uncertainty behind generic words like `manager`, `data`, or `processor`

## Sources

1. Martin Fowler, "Ubiquitous Language" — https://martinfowler.com/bliki/UbiquitousLanguage.html
2. Repo canon: `roles/architect/ROLE.md`, `roles/architect/RUBRIC.md`
