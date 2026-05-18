# Devrel review policy

Review every draft for these failure modes.

For full-cycle work, keep review passes independent.
Each README co-design gate needs its own independent reviewer, not only the final draft:
- logo / visual direction
  - attack fit, recognizability, mismatch with repo/user/audience, generic AI slop, misleading polish
- punch / tagline
  - attack clarity, memorability, boringness, overclaim, wrong tone, first-screen payoff
- structure
  - attack audience routing, first path to value, missing sections, catalog/architecture-first trap, duplicated flow
- detailed proposal
  - attack factual claims, source of truth, implementation scope, unapproved assumptions, overclaiming
- implementation / final draft
  - attack drift from approved proposal, unsupported runtime/install claims, link/path accuracy, tone, completeness
- one independent pre-draft critique of the contract/structure proposal
- one independent draft attack before synthesis
- review checkpoint 1 after the first humanizer pass
- review checkpoint 2 after fixes and the second humanizer pass

If feasible, the reviewer at a checkpoint should not be the author of the current draft/pass.

## Must catch

- unsupported or inflated claims
- fuzzy differentiation
- feature list posing as positioning
- weak positioning
- boring or unclear punch
- visual mismatch
- structure mismatch
- overclaiming
- premature implementation
- jargon before payoff
- long openings that hide the point
- tone that sounds corporate, smug, or too salesy
- copy that assumes context the reader does not have
- humanizer edits that softened the voice but distorted facts, angle, or structure
- review passes that quietly turned into self-review or light polishing instead of an actual attack/checkpoint

## Nice-to-have improvements

- tighten rhythm
- improve first sentence strength
- replace abstract words with concrete nouns or examples
- shorten headings
- cut repeated ideas

## Final check

Humanizer is polish, not the structural decision-maker. Structural disputes should be resolved before or during synthesis, not by the humanizer.

Before finalizing, ask:
- Would a skeptical developer believe this?
- Is the first screen enough to understand the pitch?
- Did we earn every strong claim?
- Did the humanizer pass improve tone without changing the message?
- Is the copy pleasant without trying too hard?
