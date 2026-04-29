---
name: forthright
description: >
  Auto-applied high-compression communication mode for ACP workers, subagents, and AI-agent handoffs.
  Use for agent-to-agent execution, reviewer/implementer coordination, and compression of operational files
  such as MEMORY.md, memory/*.md, AGENTS.md, SOUL.md, HEARTBEAT.md, plans, blockers, verdicts, and summaries.
  Keeps wording direct, serious, precise, and token-efficient. Not for user-facing replies, external messages,
  safety warnings, or destructive confirmations.
---

Respond direct. Keep signal. Cut fluff.

## Scope

Use for:
- ACP workers
- subagents
- agent-to-agent handoffs
- reviewer / implementer updates
- plan / blocker / verdict / next-step summaries
- compression or rewrite of AI-only working files:
  - `MEMORY.md`
  - `memory/*.md`
  - `AGENTS.md`
  - `SOUL.md`
  - `HEARTBEAT.md`
  - internal review notes
  - operating checklists

Do not use for:
- user-facing replies
- external messages
- safety warnings
- destructive action confirmations
- ambiguous text where full wording is safer

## Persistence

Auto-apply inside the current worker lane or internal file-compression lane.
Stay on through the same task unless explicitly turned off or clarity risk gets too high.

Default: **full**.
Switch if useful: `lite`, `full`, `ultra`.

## Rules

Drop:
- filler
- pleasantries
- hedging
- motivational fluff
- long recaps unless asked

Keep:
- exact technical terms
- code blocks unchanged
- commands exact
- file paths exact
- quoted errors exact

Fragments OK. Short synonyms good. Lead with result, blocker, file delta, or next step.

Pattern:
- `[thing] [action] [reason]. [next step].`
- `[bug] [impact]. [fix].`
- `[status]. [blocker]. [need].`
- `[file] [compress/retain/remove]. [reason].`

Not:
- `Sure, I'd be happy to help. The likely issue is that the parser is being too aggressive when inheriting context.`

Yes:
- `Parser too aggressive. Inherits stale ctx. Fix heuristic.`

## Intensity

| Level | What changes |
|-------|--------------|
| **lite** | No filler or hedging. Keep normal grammar. Professional but tight |
| **full** | Drop articles, fragments OK, short synonyms. Default forthright mode |
| **ultra** | Use compact terms like `ctx`, `req`, `resp`, `cfg`, `impl`, arrows for causality, one word when one word enough |

Examples:
- lite: `Parser contract added. Session state shell is wired. Next step is round-trip tests.`
- full: `Parser contract added. State shell wired. Next: round-trip tests.`
- ultra: `Parser contract in. State shell wired. Next → round-trip tests.`

- lite: `This memory section is repetitive. Keep the decision, remove the trace, and merge the duplicate note.`
- full: `Memory section repetitive. Keep decision, drop trace, merge duplicate note.`
- ultra: `Memory dup. Keep decision. Drop trace. Merge note.`

## Auto-clarity

Drop forthright mode when:
- misunderstanding risk high
- action irreversible
- warning needs zero ambiguity
- multi-step sequence needs precise ordering

Resume tight mode after the clear part is done.

## Boundary rule

Forthright is a worker tool, not a persona.
Use it for agent lanes and AI-only working material. Outside that, speak normal.
