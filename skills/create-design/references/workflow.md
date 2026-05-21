# Create-Design Workflow

Use this file when creating, rewriting, reviewing, or materially restructuring a project's design-memory system.

Create Design is `Frontend-Taste` acting as design architect for repo design memory. It creates or edits design law, not frontend implementation.

This workflow is approval-gated even for review-only passes.
If the target mode or scope is still fuzzy, route first-pass discovery through `grill-me`, then come back here.

## Stage map

1. `source-audit`
2. `Frontend-Taste proposer` / `proposal`
3. `visual-direction calibration` when creating or repairing design law without a chosen direction
4. `implement`
5. `Frontend-Taste attacker` / `critic/fix loop`
6. `post-implement review`

Not every task needs the full weight, but the stage boundaries should stay intact. The proposer and attacker are separate `Frontend-Taste` passes; do not let the drafter self-approve.

## Frontend-Taste role split

Use `../../roles/frontend-taste/ROLE.md` and `../../roles/frontend-taste/RUBRIC.md` directly, then follow the loaded role files for any additional design-memory or learning references. Apply the role in two distinct passes:

- `Frontend-Taste proposer/design architect`: closes the base design context, chooses the product-tied direction, and drafts or edits `DESIGN.md`.
- `Frontend-Taste attacker/critic`: attacks the proposal before the design-memory implementation is considered done.

The proposer must close, or explicitly mark unanswered, these questions before drafting:

- product type or mixed modes
- audience, including whether it is public, private, internal, invite-only, regulated, expert, or casual
- key action or reading path
- requirements, constraints, and non-goals
- trust posture, density, and emotional tone
- brand assets, screenshots, product context, competitors, and references
- visually critical states: loading, empty, error, success, permission, onboarding, long-content, and degraded-data states

`DESIGN.md` remains the operational design law and source of truth. References support the law; they do not replace it.

When either Frontend-Taste pass is delegated to a worker/subagent, role label alone is not enough. The parent prompt must include this role split plus the selected role/phase overlay and require the worker to load the selected role material before judging or producing design output. The worker must follow all instructions in loaded role material, including loading additional role material, references, rubrics, learnings, task guidance, and applicable create-design references when required. If loaded role material defines final-answer requirements, the worker must satisfy them. Do not accept the pass for a required gate when required material cannot be loaded or final-answer requirements cannot be satisfied.

## 0. Pick the mode

Choose one of these explicitly:

- `review`
  - existing design-memory review only
  - no file edits
  - output findings and recommended changes

- `proposal`
  - shape the intended design-memory plan
  - may inspect and plan, but does not edit files
  - stops for approval before edits

- `implement`
  - create or revise the design-memory files
  - declare whether the implementation is `create` or `edit`
  - includes critic/fix loop
  - must end with post-implementation review before completion

If the task started as `review` and now wants edits, stop and get explicit approval for the write phase.

## 1. Approval gate

Before any substantive work:
- confirm the mode
- confirm the target design-memory surface
- wait for explicit `APPROVED` or `LGTM`

Do not start:
- review findings generation
- restructuring execution
- file drafting
- fix loops
- review loops
before that approval.

Allowed before approval:
- one blocking clarification at a time
- read-only repo/source inspection when needed to understand scope, choose mode, or identify the current artifact shape
- narrowing whether the task is `review`, `proposal`, or `implement`

Not allowed before approval:
- full synthesized review findings
- full proposal output
- file drafting or edits

## 2. Source-audit stage

Start from concrete examples, not abstract design philosophy.

Inspect:
- the brief or request
- `../../roles/frontend-taste/ROLE.md` and `../../roles/frontend-taste/RUBRIC.md`, then any additional role files discovered from the loaded role files
- the product/surface type
- the current `DESIGN.md`, if present
- supporting design docs, if present
- refs only when they materially inform the direction
- repo context and constraints

Before any reference round or durable design-law draft, capture the product basis explicitly:
- product type
- audience, including whether it is closed/internal or public
- key surfaces
- primary read/action
- trust posture
- tone
- density expectation
- interaction model
- platform constraints
- constraints
- hard-nos
- content provenance
- what must not be touched

If those answers are missing, do not invent a full `DESIGN.md` from vibes. Ask the smallest blocking question set or mark the unknowns as unresolved proposal inputs.

Default review outputs:
- representative asks
- current or intended mode
- success criteria candidates
- artifact shape candidates
- risks / ambiguity
- recommendation: stop at review, continue to proposal, or continue to implementation planning

## Branch handling

Use this matrix to close the main workflow branches explicitly:

- `review` -> findings only -> stop unless the user separately approves proposal or implementation
- `proposal` -> plan only -> stop for write approval before any edits
- `implement/create` -> create a new design-memory system -> critic/fix -> post-implement review
- `implement/edit` -> revise an existing design-memory system -> critic/fix -> post-implement review
- mode change midstream -> stop and get the correct approval before continuing
- tiny wording or contract-only fix -> may compress ceremony, but still declare the mode and keep the same approval semantics
- refs justified -> only when they remove ambiguity or materially improve direction
- refs not justified -> keep the workflow doc-only
- `implement/create` or design-law repair without an explicit chosen visual direction -> run the reference refinement loop before writing canonical `DESIGN.md`
- existing `DESIGN.md` lightweight screen review or Frontend-Taste role work -> do not run the create-design reference loop unless the design-law artifact itself is being created or repaired

## 3. Proposal stage

Run `Frontend-Taste` as the proposer/design architect. Turn the audited material into a concrete design-memory shape.

Before drafting, close the base design-context questions or mark exactly what is unanswered.

Decide:
- target folder/file shape
- what belongs in `DESIGN.md`
- what belongs in supporting docs
- whether refs are actually justified
- if a reference/direction loop is justified, use exactly 3 references/options per round; do not import Frontend-Taste's 3-4 visual-proposal count into create-design
- what the critical branch closures are
- what the success criteria are

Minimum proposal checks:
- `DESIGN.md` can stay operational rather than bloated
- supporting docs are justified rather than ceremonial
- claimed output matches what the skill will actually produce
- downstream usage is clear enough for later review or implementation

After proposal:
- if edits are required, stop and wait for explicit approval before implementation
- do not smuggle implementation through the proposal stage

## 3A. Visual-direction reference refinement loop

Run this loop before canonical `DESIGN.md` creation or repair when the design direction is not already chosen.
The goal is calibration, not copying references. Do not write or update `DESIGN.md` from taste guesses.

Chosen visual direction minimum bar:
- A direction is explicit enough to bypass the loop only when palette, typography, layout model, density, shape/radius language, motion/interaction tone, and hard-no items are each either specified or explicitly accepted as gaps.
- Vague taste labels are not enough. `premium dark launcher`, `clean SaaS`, or `Apple-like but cooler` still trigger the loop unless those axes are covered.
- If an axis is an accepted gap, name how it will be handled later; do not silently fill it with agent taste.

Applicability:
- required for `implement/create` when the brief does not already contain an explicit visual direction
- required for design-law repair when the current direction is incoherent, absent, or based on unstated taste
- not for lightweight Frontend-Taste screen review inside an existing `DESIGN.md`
- not for routine implementation review where the canonical design law already exists and is stable

Reference round rules:
- one round contains exactly 3 references/directions/options
- the 3 options must be meaningfully different, not near-duplicates
- vary at least 2-3 relevant axes per round: layout model, palette direction, density, typography character, shape/radius language, interaction/motion tone, emotional tone
- include multiple palette hypotheses appropriate to the product basis; never present one self-selected palette as the only path
- do not copy references; extract direction constraints and tradeoffs
- do not present one nice option and canonize it

Required per-option shape:
- distinct thesis: what this option believes the product should feel like
- palette hypothesis: primary dark/light/color role direction, not final tokens
- layout model: navigation, composition, hierarchy, and information grouping idea
- axes: type character, density, shape/radius, and motion/interaction tone
- borrow: constraints, relationships, or mechanics worth adopting
- do-not-copy: visual signatures, brand markers, or ornamental details that must stay out

Reference synthesis, not copying:
- Good: borrow `tight command-center density + restrained amber status accents`; reject the source brand's logo geometry and exact gradients.
- Bad: recreate the reference's hero, icon style, palette, and spacing because it looked premium.

Decision point after each round:
- Sergey may pick one option
- Sergey may mix parts of multiple options
- Sergey may reject all options
- Sergey may ask to continue with another round

Direction approval boundary:
- Choosing, combining, or narrowing options approves design direction only.
- It does not approve file edits unless the active mode is already approved `implement`.
- If the workflow was still in `review` or `proposal`, stop after direction synthesis and get explicit write approval before creating or updating files.

After every feedback point, record:
- what was liked
- what was rejected
- direction constraints
- hard-no items

Iteration limits:
- maximum 3 rounds
- each next round must reflect prior feedback
- do not replay the same variants with cosmetic changes
- if 3 rounds are exhausted, stop and require an explicit decision; do not auto-synthesize

Before writing or updating canonical `DESIGN.md`, produce a direction synthesis covering:
- chosen direction
- rejected directions
- palette direction, or explicit accepted gap
- typography direction, or explicit accepted gap
- layout direction, or explicit accepted gap
- density, or explicit accepted gap
- shape/radius, or explicit accepted gap
- motion, or explicit accepted gap
- critical hard-no items, or explicit accepted gap
- open risks

Only after that synthesis may create-design write or update canonical `DESIGN.md`.

## 4. Implement stage

If the visual-direction reference refinement loop applies, enter implementation only after Sergey has chosen, mixed, or explicitly decided a direction and the synthesis exists. No canonical `DESIGN.md` before that gate. Direction choice alone is not write approval; it only satisfies the visual-direction gate.

Run `Frontend-Taste` as the proposer/design architect for the approved write phase. Build the smallest useful design-memory structure:
- `DESIGN.md` for the main design law and artifact routing
- supporting docs only when they remove real ambiguity or bloat

Implementation rules:
- keep `DESIGN.md` lean enough to navigate
- do not write design law from a single self-selected palette, near-duplicate options, or unapproved reference guesses
- keep rules operational rather than atmospheric-only
- do not promise artifacts that do not exist
- do not let refs replace doctrine
- if the design needs multiple docs, make their boundaries explicit

## 5. Critic/fix loop

After the first draft, run a structured review/fix loop. The required adversarial pass is a separate `Frontend-Taste` attacker/critic, not the same proposer re-reading its own work.

Default loop:
1. draft or revise
2. critic review
3. fix
4. critic review
5. fix again if needed

Run a third review/fix round when:
- `DESIGN.md` is still bloated
- artifact boundaries are still fuzzy
- rules are still vague or contradictory
- downstream usage is still unclear

Critic focus:
- product and audience clarity
- requirements, constraints, and unanswered questions
- `DESIGN.md` priority as source of truth
- direction coherence across product, audience, trust, density, tone, key action, brand, screenshots, and refs
- reference synthesis quality: extracted principles, rejected mismatches, no copying
- generic/slop risks and fashionable aesthetic-label thinking
- missing critical states
- contradictions between palette, type, layout, spacing, motion, density, and tone
- artifact contract coherence
- operational value vs decorative prose
- do/don't clarity
- downstream usability

## 6. Post-implementation review

Do not stop at “edits done”.

Review the implemented result against the approved proposal and the `Frontend-Taste` attacker findings:
- did it change the right thing?
- did it change it the right way?
- does it match the approved scope?
- can a downstream reader use `DESIGN.md` without guessing?
- are supporting docs justified and linked clearly?
- did any branch remain only conceptually described instead of operationally closed?

For non-trivial rewrites, treat this as a real gate, not a courtesy lap.

## 7. Late-stage compression

After the main draft/review/fix loop is clean, run one compression pass through `forthright` for AI-only design-memory material when that removes wording fat without weakening trigger boundaries, artifact rules, or safety constraints.

Then do one final sanity review.

## 8. Testing

Validate with representative prompts.

Check:
- intended asks trigger correctly
- create/repair asks without an explicit chosen direction trigger the 3-option reference loop and direction synthesis before `DESIGN.md`
- existing-`DESIGN.md` lightweight role work does not over-trigger the create-design reference loop
- paraphrases still trigger
- adjacent prompts do not over-trigger
- the workflow stays honest when mode or scope changes
- supporting docs are justified rather than ceremonial
- `DESIGN.md` remains operational
- trigger quality and false-positive rate were reviewed explicitly

## 9. Finalize

Stop only when:
- the approved mode was completed cleanly
- any required write phase had explicit approval
- post-implementation review is clean enough
- the skill folder is internally consistent
- referenced files actually exist
- claimed capabilities match the shipped shape
