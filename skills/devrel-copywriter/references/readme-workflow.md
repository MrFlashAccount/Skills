# Repository readme workflow

Use this only for repository `readme` work.

This file owns the process. Use `../../roles/dev-rel/ROLE.md` and `../../roles/dev-rel/RUBRIC.md` for the general DevRel quality bar. Do not deep-link from this skill into DevRel learnings or role-internal reference files.

## Flow

1. discovery / contract
2. gather references
3. product truth gate
4. product identity pass
5. proposer stage: propose `2-3` structure directions
6. independent pre-draft critique / contract attack
7. short debate / reconciliation
8. get approval when the chosen direction materially changes public positioning or structure expectations
9. draft
10. independent DevRel critic attack
11. synthesizer/editor resolves critique and owns the final draft
12. humanizer pass
13. review checkpoint 1
14. fix
15. humanizer pass
16. review checkpoint 2
17. final checklist

## 1. Discovery / contract

Capture the minimum before drafting:

- what the product is
- who it is for
- what problem it solves
- what it does
- what the shortest path to first value is
- what must be clear on the first screen
- proof points, constraints, and risky claims

If these are unclear, stop and resolve them before writing.

## 2. Gather references

Collect the concrete sources that can ground the `readme`:

- current repo `readme`, if any
- source tree and runnable entrypoints
- config, install, and example paths
- docs or reference pages linked from the repo
- screenshots or demos only if they are real and available

Do not invent a quickstart. Verify the proposed first-value path against repo/source/config/examples/docs before treating it as usable.

## 3. Product truth gate

Do this before visual direction, structure choice, or drafting.

You must be able to state, from inspected sources, all of the following:

- what the product or project is
- who the target audience or user is
- the audience `JTBD`
- why it exists / what purpose it serves
- the primary promise or selling point
- the key features or capabilities
- what makes it meaningfully different
- the shortest believable path to first value
- the source or proof basis for each of the above

If any of these are unknown, fuzzy, or unsupported, stop. Ask, research, or inspect the repo/docs/product sources until the contract is real enough to support the README.

## 4. Product identity pass

Do this only after the product truth gate is satisfied and before choosing structure or drafting.

Lock the product packaging:

- `Name`
- `Logo / visual direction`
- `Tagline`
- `One-sentence pitch`
- `Category`
- `Audience / JTBD`
- `What it is`
- `Why it exists`

## 4. README co-design workflow

Use this gate set for a new repository `readme` or any major rewrite.

This path is intentionally slower and more bureaucratic than normal copy edits.
Each gate needs an independent reviewer.
Do not move to the next gate without human approval.
Do not edit the README before the detailed proposal is approved.
Use image generation when it materially helps the logo or visual-direction decision.

Required gates:
1. `Logo / visual direction`
2. `Punch / tagline`
3. `Structure`
4. `Detailed proposal`
5. implementation only after explicit human approval
6. PR only after final review

The proposer stage's `2-3` structure directions are options inside the `Structure` gate, not separate permission to draft or implement.
Choosing a structure direction does not authorize README writing; implementation still waits for an approved detailed proposal.

If the first-screen README framing depends on a logo, hero, or visual direction that is not fixed yet, stop before draft or implementation. Compare concrete metaphor territories, get human approval on the direction, fix the asset choice, then continue.

## 5. Proposer stage: propose `2-3` structure directions

The proposer owns the framing and structure proposal.

State `2-3` viable directions before writing the full draft.

Typical directions:
- product-first
- developer-quickstart-first
- problem-solution-first

For each direction, state:
- what the first screen emphasizes
- why that structure fits this product
- what tradeoff it makes
- where the first-value slice appears
- how the opening hands off into deeper docs/examples/reference

Choose a direction before full drafting.

Reject directions that cannot satisfy the DevRel role's repository `readme` quality bar.

## 6. Independent pre-draft critique / contract attack

Attack the plan before writing the full draft.

This is an independent pass, not self-review by the proposer.

Check the proposed contract and structure against the DevRel role lenses plus the DevRel rubric.

Attack especially for:
- vague or fake-differentiated positioning
- unsupported claims
- audience mismatch
- weak proof or source grounding
- structure choices that fail the checklist or cannot be supported by repo evidence

If the contract or structure breaks under critique, fix that first.

Before drafting, confirm the chosen direction can satisfy the checklist with real repo evidence.

## 7. Short debate / reconciliation

Resolve the proposer/critic disagreement before drafting. Do not average both sides or blindly accept either side.

The goal is a single chosen direction with explicit tradeoffs and evidence backing it.

## 8. Approval when needed

Pause before the full draft when the chosen direction materially changes:

- public positioning
- promised audience
- product naming/tagline choices
- expected repo information architecture

For README co-design work, require explicit human approval after each gate and before the full draft implementation.

## 9. Draft

Write for scan speed and first-use confidence.

Use the chosen structure direction plus the DevRel role guidance and rubric to guide the draft.

## 10. Independent DevRel critic attack

This stage is required.

After the first full draft, run an independent critic-style attack using the DevRel and critic lenses. The critic should attack the draft, not lightly polish it.

The critic must attack the draft using the DevRel role lenses and rubric, with special attention to first-screen clarity, product identity, proof, and whether the promised first-value path is real.

Fix structural issues before final polish.

## 11. Synthesizer/editor resolves critique and owns the final draft

The synthesizer/editor resolves critique from the proposal attack and the draft attack, then owns the resulting draft.

Do not average proposer and critic output or blindly accept either side.

## 12. Humanizer pass

Run a humanizer-style cleanup after meaningful fixes. Improve tone and rhythm without changing facts, claims, or structure by accident.

Humanizer is a polish pass, not the structural decision-maker.

## 13. Review checkpoint 1

Run one independent review after the first humanizer pass.

## 14. Fix

Apply the checkpoint 1 fixes before the second polish pass.

## 15. Humanizer pass

Run a second humanizer pass only after fixes if the copy still needs tone/rhythm cleanup.

## 16. Review checkpoint 2

Run the second independent review/checkpoint on the updated draft.

## 17. Final checklist

Pass final DevRel role/rubric review before finalizing.
