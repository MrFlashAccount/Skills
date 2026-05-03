---
name: humanizer
description: >-
  Polish a draft so it sounds more natural, casual, clear, or human without
  changing the core message. Use for asks like “make this sound less AI”,
  “rewrite this more naturally”, “make this warmer/shorter/more casual”, or
  “humanize this text”, especially for chat messages, outreach, captions, and
  general copy polish. Do not use it for domain-specific writing strategy,
  content planning, or major structural rewrites.
---

# Humanizer

Use this skill when the user already has text and wants a cleaner, more natural rewrite.

## Core rule

Do not lecture about writing.
Do not explain AI patterns unless the user explicitly asks.
Default output is the rewritten text itself.

## Hard boundaries

- Preserve the core meaning.
- Preserve the input language unless the user explicitly asks to translate.
- Preserve the rough format and shape unless the user asks for a different one.
  - Keep bullets as bullets.
  - Keep line breaks when they matter.
  - Keep message-style text easy to copy and send.
- This skill is for tone and naturalness polishing, not for domain-specific messaging strategy.

## If the user gives no text

Ask for the exact draft, sentence, or message they want rewritten.

## What to optimize for

- simpler wording
- more natural rhythm
- less formality
- less obvious assistant/LLM polish
- fewer decorative phrases
- same intent, less fluff

## Default behavior

When given text:
1. keep the meaning
2. make it shorter if possible
3. remove stiffness, corporate tone, and over-explaining
4. prefer words a real person would actually send
5. keep the emotional tone the user seems to want
6. output only the final rewritten version unless asked for options

## Tone rules

### For casual / dating / chat messages
- sound like a real person, not a copywriter
- keep it smooth, confident, and easy
- avoid grand language, therapy-speak, or fake depth
- a little charm is good; cringe is not

### For professional messages
- keep it clean and human
- remove buzzwords and inflated phrasing
- prefer direct sentences over polished fluff

### For personal writing
- allow warmth, edge, humor, or imperfection when it helps
- perfect symmetry is not required

## Avoid by default

- long analysis
- bullet lists unless the user asked for comparison
- phrases like “this version sounds more human because...”
- inflated adjectives
- abstract nouns stacked together
- fake intimacy
- obvious AI transitions like “moreover”, “furthermore”, “in today’s landscape”
- em-dash addiction
- rule-of-three filler

## Rewrite heuristics

Prefer:
- simpler words over polished phrases
- shorter openings
- cleaner endings
- direct wording over decorative wording

Cut things that feel:
- too polished
- too literary
- too explanatory
- too obviously written by an assistant

## Output modes

### Default
Return one cleaned-up version only.

### If the user asks for options
Return up to 3 variants max, clearly labeled, with short differences.

### If the user asks to compare versions
Keep the comparison brief and practical. Pick one and say why in one or two lines.

## Final check before answering

Ask silently:
- Would a normal person actually send this?
- Is there any phrase here that smells like assistant-writing?
- Can I make it 10-20% simpler without losing intent?

If yes, simplify again.

When in doubt, choose the less fancy version.
