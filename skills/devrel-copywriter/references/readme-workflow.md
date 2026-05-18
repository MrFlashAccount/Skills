# Repository readme workflow

Use this only for repository `readme` work.

This file owns the process. Use `../../roles/dev-rel/ROLE.md` and `../../roles/dev-rel/RUBRIC.md` for the quality bar.

## Flow

1. discovery / contract
2. gather references
3. product identity pass
4. propose `2-3` structure directions
5. pre-draft critique / contract attack
6. get approval when the chosen direction materially changes public positioning or structure expectations
7. draft
8. DevRel critic attack
9. revise
10. humanizer pass
11. final review and checklist

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

Do not invent a quickstart. Check the first-value path against repo/source/config/examples/docs before treating it as usable.

## 3. Product identity pass

Do this before choosing structure or drafting.

Lock the product packaging:

- `Name`
- `Logo / visual direction`
- `Tagline`
- `One-sentence pitch`
- `Category`
- `Audience / JTBD`
- `What it is`
- `Why it exists`

## 4. Propose `2-3` structure directions

State `2-3` viable directions before writing the full draft.

Typical directions:
- product-first
- developer-quickstart-first
- problem-solution-first

For each direction, state:
- what the first screen emphasizes
- why that structure fits this product
- what tradeoff it makes

Choose a direction before full drafting.

## 5. Pre-draft critique / contract attack

Attack the plan before writing the full draft.

Check for:
- vague or fake-differentiated positioning
- unsupported claims
- audience mismatch
- too much abstraction too early
- a first screen that hides the payoff
- a structure that collapses into install-first or status-dump habits
- a first-value path that is ungrounded or unverified

If the contract or structure breaks under critique, fix that first.

## 6. Approval when needed

Pause before the full draft when the chosen direction materially changes:

- public positioning
- promised audience
- product naming/tagline choices
- expected repo information architecture

If the task already authorizes the rewrite direction, proceed.

## 7. Draft

Write for scan speed and first-use confidence.

Default emphasis:
- strong first screen
- clear problem and value
- clear explanation of what the product does
- short path to trying, connecting, or using it
- logical navigation to deeper material

## 8. DevRel critic attack

This stage is required.

After the first full draft, run a critic-style attack using the DevRel and critic lenses. The critic should attack the draft, not lightly polish it.

The critic must check:
- is it clear on the first screen what this is
- is the pitch weak, vague, or generic
- is the audience hidden or blurred
- did the text drift into internal context
- is the quickstart real and usable
- did the `readme` become a status dump
- did product identity get lost
- are claims stronger than the proof

Fix structural issues before final polish.

## 9. Revise

Apply the structural fixes from the critic attack before polishing language.

## 10. Humanizer pass

Run a humanizer-style cleanup after meaningful fixes. Improve tone and rhythm without changing facts, claims, or structure by accident.

## 11. Final review and checklist

Run independent review, then pass the DevRel repository `readme` quality checklist/final role review before finalizing.
