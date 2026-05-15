# Create-Design Workflow

Use this file when creating, rewriting, reviewing, or materially restructuring a project's design-memory system.

This workflow is approval-gated even for review-only passes.
If the target mode or scope is still fuzzy, route first-pass discovery through `grill-me`, then come back here.

## Stage map

1. `source-audit`
2. `proposal`
3. `implement`
4. `critic/fix loop`
5. `post-implement review`

Not every task needs the full weight, but the stage boundaries should stay intact.

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
- the product/surface type
- the current `DESIGN.md`, if present
- supporting design docs, if present
- refs only when they materially inform the direction
- repo context and constraints

Product-basis intake must be explicit before drafting durable design law:
- product type
- audience
- key surfaces
- primary read/action
- trust posture
- density
- tone
- constraints
- hard-nos
- content provenance

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

## 3. Proposal stage

Turn the audited material into a concrete design-memory shape.

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

## 4. Implement stage

Build the smallest useful design-memory structure:
- `DESIGN.md` for the main design law and artifact routing
- supporting docs only when they remove real ambiguity or bloat

Implementation rules:
- keep `DESIGN.md` lean enough to navigate
- keep rules operational rather than atmospheric-only
- do not promise artifacts that do not exist
- do not let refs replace doctrine
- if the design needs multiple docs, make their boundaries explicit

## 5. Critic/fix loop

After the first draft, run a structured review/fix loop.

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
- design doctrine clarity
- artifact contract coherence
- operational value vs decorative prose
- contradictions between palette, type, layout, spacing, and motion
- do/don't clarity
- downstream usability

## 6. Post-implementation review

Do not stop at “edits done”.

Review the implemented result against the approved proposal:
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
