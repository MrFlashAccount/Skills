# Repo Architecture Memory Convention

This convention defines how repo-specific architecture memory should be recorded in a target repository.

Use it when a role or skill needs to preserve project-specific architectural language, context structure, or load-bearing design decisions.

## Purpose

Separate reusable role knowledge from project-specific architectural memory.

- Reusable role knowledge lives in `Roles/`.
- Project-specific architecture memory lives in the target repo.
- Exact file names may vary by repo; the durable purpose matters more than one fixed path.

If an Architect or calling skill discovers a durable project-specific constraint, naming rule, context split, or architectural decision, it should be written into repo architecture records instead of being pushed into a shared role learning file.

## Default artifacts

These names and locations are defaults, not mandatory universal paths.
A target repo may use equivalent artifact names or locations if the intent stays clear and stable.

### `CONTEXT.md` or repo-equivalent context glossary
Use when the repo has a meaningful shared domain language that should stay stable across tasks.

Typical contents:
- ubiquitous language
- core concepts
- concept definitions
- relationships between concepts
- flagged ambiguities and preferred terms

Create or update this when:
- a core concept is introduced or clarified
- the same concept is being named inconsistently
- one term is being used for multiple concepts
- future work would likely drift without a shared language record

Do not create it for:
- generic programming terminology
- one-off implementation details
- transient project chatter

### `CONTEXT-MAP.md` or repo-equivalent context map
Use when the repo has multiple bounded contexts or distinct domain areas whose relationships need to stay explicit.

Typical contents:
- named contexts
- where each context lives
- interactions between contexts
- ownership boundaries
- shared concepts or translation points

Create or update this when:
- one context starts talking to another
- a new bounded context appears
- ownership between modules or domains is unclear
- a change alters how contexts relate

Do not create it when:
- the repo still behaves like one coherent context
- the split is hypothetical rather than real

### `docs/adr/` or repo-equivalent decision log
Use for load-bearing architecture decisions that future work should not silently rediscover or reverse.

Typical contents:
- decision
- context
- alternatives considered
- why this path won
- tradeoffs
- consequences

Create or update an ADR when:
- a decision changes architecture shape, module boundaries, or seams
- an important alternative was consciously rejected
- a future reviewer would otherwise reopen the same debate
- rollback, migration, or long-lived constraints depend on remembering the reasoning

Do not create ADRs for:
- tiny obvious fixes
- transient implementation tactics
- decisions with no lasting architectural effect

## Decision rules

Use this quick mapping:
- **Language drift or concept clarification** -> `CONTEXT.md` or equivalent context glossary
- **Multiple contexts or changed context relationships** -> `CONTEXT-MAP.md` or equivalent context map
- **Load-bearing architecture decision or rejected alternative** -> `docs/adr/` or equivalent decision log

Sometimes more than one artifact should be updated.
For example:
- introducing a new domain concept may require `CONTEXT.md` or an equivalent context glossary
- splitting one domain area into two bounded contexts may require both `CONTEXT.md` and `CONTEXT-MAP.md`, or repo-equivalent artifacts
- choosing a new seam or adapter model may require an ADR or equivalent decision record and, if terminology shifts, a context glossary update

## Role and skill responsibilities

### Architect role
The Architect should distinguish between:
- reusable role heuristics -> keep in `Roles/`
- project-specific architecture memory -> write into the target repo's architecture records

The Architect may require architecture-record updates as part of:
- research output
- architecture constraints
- review findings

### Research-phase use
A research or proposal skill may:
- derive required architecture-record updates
- include them in constraints or acceptance criteria
- stop short of editing them if the task has not approved doc changes yet

### Review-phase use
A review skill may:
- verify that required architecture-record updates were made when the change needed them
- flag missing updates as architectural drift

## Anti-patterns

Avoid:
- storing repo-specific architectural decisions in shared role learnings
- creating ADRs for every small implementation choice
- using `CONTEXT.md` as a dumping ground for generic engineering notes
- creating `CONTEXT-MAP.md` before multiple contexts are actually real
- letting architecture-significant changes land without updating the repo memory that explains them

## Minimal expectation

Not every repo needs all three artifacts.
Use only the smallest set that preserves architectural clarity for future work.
