---
name: devrel-copywriter
description: Write or rewrite human, product-aware developer-facing positioning and devrel copy for README intros, launch posts, X/Twitter threads, changelog blurbs, landing-page sections, feature messaging, and docs openings when the job is framing, angle, messaging, or copy polish. Use `docs-writer` instead when the main job is explaining usage, setup, flow, migration, or API behavior.
---

# Devrel Copywriter

Use this skill as a small writing harness for developer-facing devrel and product-marketing copy.

Route first. If the main job is explaining usage, setup, product flow, migration steps, or API behavior, use `docs-writer` instead. In docs contexts, this skill may only frame or polish the opening.

Build the writing contract before drafting, editing, or repositioning anything.

Own framing, positioning, message hierarchy, and copy polish. Prioritize believable value, fast comprehension, and human tone. Avoid hype, fake conviction, and claims the product cannot support.

## Read order

- Read [`../../Roles/DevRel/ROLE.md`](../../Roles/DevRel/ROLE.md).
- Read [`../../Roles/DevRel/RUBRIC.md`](../../Roles/DevRel/RUBRIC.md).
- Start with [references/task-contract.md](references/task-contract.md).
- For `full-cycle` work, also read [references/surfaces.md](references/surfaces.md).
- Read [references/review-policy.md](references/review-policy.md) before the first independent review.

## Task class

- `tiny`: a local wording, flow, or emphasis fix that does not change audience, angle, structure, headline, positioning, or claim hierarchy.
- `full-cycle`: a new artifact or any rewrite that changes angle, audience, structure, proof framing, public-facing message, headline, positioning, or claim hierarchy.

If unsure, treat it as `full-cycle`.

## Workflow

- `tiny`: short contract -> edit -> humanizer pass -> one independent review.
- `full-cycle`: contract -> critique -> short debate -> draft -> humanizer pass -> review checkpoint 1 -> fix -> humanizer pass -> review checkpoint 2.

## Workflow details

### 1. Define the writing contract

Build the contract before touching copy.

Capture only what matters:
- artifact
- audience
- surface
- goal
- scope
- structure
- source material / proof points
- claims that are allowed
- claims that are risky or unsupported
- tone constraints
- CTA or desired reader action

If key facts are missing, ask only for the smallest blocking gap.

### 2. Critique the contract

Challenge the plan before drafting.

Check for:
- vague or fake-differentiated positioning
- unsupported claims
- audience mismatch
- too much abstraction too early
- structure that hides the payoff
- tone drift into corporate sludge or overhype

If the contract breaks under critique, fix the contract first.

### 3. Run a short debate for `full-cycle` work

Use two voices:
- `devrel`: make the strongest clear, attractive, product-aware version using `Roles/DevRel/ROLE.md`
- `critic`: attack fluff, confusion, overclaim, weak proof, and bad sequencing using `Roles/Critic/ROLE.md`

Run one short round, then synthesize. Do not let the debate sprawl.

Skip debate for `tiny` edits.

### 4. Draft or edit

Write for scan speed first.

Defaults:
- lead with the payoff
- keep nouns concrete
- hide internals unless they help the reader choose or trust
- prefer one strong idea per paragraph
- use examples when they remove ambiguity fast
- compress instead of stacking adjectives

### 5. Run the built-in humanizer pass

After the first draft, and after each meaningful fix pass, do a humanizer-style polish pass inside this skill. Treat it as an internal pass, not a dependency on the separate `humanizer` companion skill.

Use it to:
- soften AI-ish, corporate, smug, or over-produced phrasing
- remove empty intensity and fake conviction
- tighten obvious filler and repeated ideas

Do not use it to:
- replace critique, debate, or review
- change facts, claims, angle, or structure unless you intentionally reopen the draft
- sand off useful specificity or product truth

### 6. Run independent review

Review must happen after the relevant humanizer pass.

For `tiny` work, run one independent review pass.
For `full-cycle` work, run two review checkpoints: review the whole artifact against the policy, fix findings, then re-humanize and review again before finalizing.

## Rules

- Treat `Roles/DevRel/ROLE.md` as the canonical writing/review identity for developer-facing messaging; this skill supplies the devrel-stage workflow and contracts.
- Do not invent proof.
- Do not use exact metrics unless confirmed.
- Do not promise roadmap items as current reality.
- Do not sound like ad copy unless the user explicitly wants ad copy.
- Keep developer trust above cleverness.
- Prefer fast, clean structure over ornate phrasing.
