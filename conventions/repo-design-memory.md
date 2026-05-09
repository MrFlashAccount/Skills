# Repo Design Memory Convention

This convention defines how repo-specific design memory should be recorded in a target repository.

Use it when a role or skill needs stable repo-local design law instead of generic taste judgment.

## Purpose

Keep project-specific design truth separate from portable taste canon.

- `Roles/Frontend-Taste/learnings/` holds reusable taste knowledge across repos.
- repo design memory holds what is true for this product here.

## Minimal contract

Start small.

Recommended entrypoint:
- `DESIGN.md`

Recommended downstream files:
- `design/project-type.md`
- `design/profile.md`
- `design/tokens.md`
- `design/components.md`
- `design/interactions.md`
- `design/references.md`

Not every repo needs all of them on day one.
Use the smallest set that preserves clear design law.

## `DESIGN.md`

`DESIGN.md` should be short and routing-first, similar in spirit to `AGENTS.md`.

It should:
- state the repo's primary product class
- point to the highest-signal downstream design files
- tell reviewers/implementers what to read first
- stay small enough that people actually maintain it

It should not become a giant design bible.

## Project type declaration

Declare one primary project type in `design/project-type.md`.

Initial recommended set:
- `marketing-site`
- `dashboard`
- `admin-panel`
- `docs-site`

If a repo mixes modes:
- declare one primary type
- declare optional secondary modes
- default routing should load the primary type only unless the current task clearly touches a secondary mode

## Precedence rule

When portable taste canon and repo design law disagree:
- repo-level design law wins

Reason:
- `Roles/Frontend-Taste` should stay portable
- repo design memory is the source of truth for this product's local tokens, component rules, and visual constraints

## Typical repo-level file responsibilities

### `design/project-type.md`
- primary type
- optional secondary modes
- short routing note for reviewers

### `design/profile.md`
- product impression and UX posture
- density bias
- tone and restraint rules
- target feel for this repo

### `design/tokens.md`
- token rules that are stable and design-significant
- color/spacing/type constraints worth preserving

### `design/components.md`
- component-level rules
- composition rules
- allowed/disallowed patterns

### `design/interactions.md`
- motion rules
- state behavior patterns
- interaction consistency rules

### `design/references.md`
- repo-approved references
- examples and anti-examples specific to the product

## Role and skill responsibilities

### `Frontend-Taste` role
- load repo design memory after the short router
- use portable learnings for taste pressure
- defer to repo design law on conflicts

### frontend implementation/review skills
- use repo design memory as project law
- use `Roles/Frontend-Taste` learnings only as supporting specialist judgment

## Anti-patterns

- storing repo tokens or brand-specific exceptions in role learnings
- turning `DESIGN.md` into a giant dump file
- loading every learning file by default instead of routing by project type
- inventing too many product classes before they prove useful
- leaving project type undeclared and pretending routing is still deterministic

## Minimal expectation

For v1, a repo is in decent shape if it has:
- a short `DESIGN.md`
- a declared `design/project-type.md`
- at least one repo-local downstream file with real design law
