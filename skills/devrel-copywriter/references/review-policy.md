# Devrel review policy

Review every draft for these failure modes.

For full-cycle work, keep review passes independent and hostile-prior by default: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent bugs. Any FAIL must be evidence-backed with file/function/line or equivalent precise location, and explain why existing tests/checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.

For full-cycle work, keep review passes independent:
- one independent pre-draft critique of the contract/structure proposal
- one independent draft attack before synthesis
- review checkpoint 1 after the first humanizer pass
- review checkpoint 2 after fixes and the second humanizer pass

If feasible, the reviewer at a checkpoint should not be the author of the current draft/pass.

## Must catch

- unsupported or inflated claims
- fuzzy differentiation
- feature list posing as positioning
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
