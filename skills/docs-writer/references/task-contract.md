# Documentation contract

Build a short contract before editing or writing.

## Required fields

- `Artifact`: quick start, getting-started guide, section rewrite, API option docs, migration note, FAQ, tutorial, etc.
- `Reader`: who this is for and what they likely know already.
- `Job to be done`: what the reader wants to accomplish.
- `First win`: the earliest meaningful success the doc should produce.
- `Scope`: what this document should and should not teach.
- `Doc mode`: quick start, tutorial / getting started, how-to guide, reference, or explanation.
- `Prerequisites`: installs, versions, setup, assumptions.
- `Source of truth`: code, existing docs, examples, tests, screenshots, maintainer statements.
- `Risk points`: hidden setup, misleading defaults, partial examples, missing imports, fragile claims.

## Compact template

- Artifact / Goal
- Reader
- First win
- Scope / Non-goals
- Doc mode
- Prerequisites
- Source of truth
- Risks / Unknowns

For tiny edits, keep the compact contract short, but still name the doc mode and source of truth.

## Critique prompts

Use these before drafting:
- What should the reader be able to do in the first minute?
- What term appears before it is explained?
- What step would fail if someone copy-pasted this cold?
- What concept belongs later?
- Are we teaching usage, architecture, or both by accident?
