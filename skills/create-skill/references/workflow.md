# Create-Skill Workflow

Use this file when creating, rewriting, auditing, or materially restructuring a skill from source material such as a PDF, SOP, workflow, prompt pack, notes, or an existing skill folder.

This workflow is approval-gated even for audit-only passes.
If the target mode or scope is still fuzzy, route first-pass discovery through `grill-me`, then come back here.

## Stage map

1. `source-audit`
2. `proposal`
3. `implement`
4. `post-implement review`

Not every task needs the full weight, but the stage boundaries should stay intact.

## 0. Pick the mode

Choose one of these explicitly:

- `audit`
  - existing skill review only
  - no file edits
  - output findings and recommended changes

- `proposal`
  - shape the intended skill or rewrite
  - may inspect and plan, but does not edit files
  - stops for approval before edits

- `implement`
  - create or revise the skill files
  - includes critic/fix loop
  - must end with post-implementation review before completion

If the task started as `audit` and now wants edits, stop and get explicit approval for the write phase.

## 1. Approval gate

Before any substantive work:
- confirm the mode
- confirm the target skill/folder/source material
- wait for explicit `APPROVED` or `LGTM`

Do not start:
- audit findings generation
- restructure planning execution
- file drafting
- fix loops
- review loops
before that approval.

Allowed before approval:
- one blocking clarification at a time
- repo/source inspection only when needed to answer that blocking clarification
- narrowing whether the task is `audit`, `proposal`, or `implement`

## 2. Source-audit stage

Start from concrete examples, not abstract theory.

For a new skill:
- reduce the source material into representative asks
- identify what must be deterministic vs flexible
- identify likely workflow branches

For an existing skill:
- inspect trigger wording, mode coverage, branch closure, claimed-vs-shipped capability, and structure split
- inspect whether the current workflow is lean, coherent, and runnable

Default audit outputs:
- representative asks
- current or intended mode
- success criteria candidates
- workflow branches
- risks / ambiguity
- sensitive-surface note if relevant
- recommendation: stop at audit, continue to proposal, or continue to implementation planning

## 3. Proposal stage

Turn the audited source into a concrete skill shape.

Decide:
- target folder shape
- what belongs in `SKILL.md`
- what belongs in `references/`
- whether `scripts/` are actually justified
- whether `assets/` are actually justified
- whether the workflow needs an explicit state machine
- what the critical branch closures are
- what the success criteria are

Minimum proposal checks:
- trigger quality on representative asks
- low false-positive rate on adjacent asks
- claimed capabilities match what shipped files/scripts can support
- destination / mode / split branches are operationally closed
- sensitive-surface handling is explicit when relevant

For metadata-only or structure-only work:
- keep the proposal short
- still state the intended change, stop condition, and review plan

After proposal:
- if edits are required, stop and wait for explicit approval before implementation
- do not smuggle implementation through the proposal stage

## 4. Implement stage

Build the smallest useful skill structure:
- `SKILL.md` for trigger metadata and default operating flow
- `references/` for bulky, detailed, or variant-specific guidance
- `scripts/` for deterministic repeated work
- `assets/` only for output resources

Implementation rules:
- keep `SKILL.md` lean
- write frontmatter carefully
- keep instructions imperative and operational
- do not promise unsupported branches
- do not let docs claim capabilities the shipped files do not actually provide
- if the workflow is iterative or leakage-prone, tighten it structurally instead of hand-waving

## 5. Critic/fix loop

After the first draft, run a structured review/fix loop.

If a critic/reviewer pass is delegated to a worker/subagent, role label alone is not enough. The parent prompt must include the selected role/phase overlay and require direct loading of only `../../roles/critic/ROLE.md` and `../../roles/critic/RUBRIC.md`; the worker must then follow the loaded role files for any additional role references and load [references/checklist.md](checklist.md) plus the relevant create-skill workflow/testing references for the current stage. The worker must return `role_files_loaded` listing `ROLE.md`, `RUBRIC.md`, and any additional files actually loaded, or `blocked` if required role loading could not be completed. Do not accept the critic/reviewer pass for a required gate when that evidence is absent or wrong.

Default loop:
1. draft or revise
2. critic review
3. fix
4. critic review
5. fix again if needed

Run a third review/fix round when:
- trigger wording is still fuzzy
- `SKILL.md` is still bloated
- branches are still ambiguous
- claimed-vs-shipped alignment is still shaky
- the workflow still feels leaky or hard to operate

Critic focus:
- trigger quality in frontmatter
- mode clarity
- approval semantics
- workflow coherence
- branch closure
- claimed-vs-shipped capability alignment
- whether detail should move out of `SKILL.md`
- whether repeated manual work should become `scripts/`
- whether the workflow should be modeled as an explicit state machine

## 6. Post-implementation review

Do not stop at “edits done”.

Review the implemented result against the approved proposal:
- did it change the right thing?
- did it change it the right way?
- does it match the approved scope?
- do representative asks route correctly?
- did adjacent out-of-scope asks stay quiet?
- is claimed capability still aligned with shipped files/scripts?
- did any branch remain only conceptually described instead of operationally closed?
- if the skill is sensitive-surface, was privacy/data-safety checked?

For non-trivial rewrites, treat this as a real gate, not a courtesy lap.

## 7. Late-stage compression

After the main draft/review/fix loop is clean, run one compression pass through `forthright` for AI-only skill material when that removes wording fat without weakening trigger boundaries or safety rules.

Then do one final sanity review.

## 8. Testing

Validate with representative asks.

Check:
- intended asks trigger correctly
- paraphrases still trigger
- adjacent prompts do not over-trigger
- branch handling is explicit and executable
- the workflow stays honest when mode or ownership changes
- bulky material stayed out of `SKILL.md`
- repeated deterministic work became a script only when justified

## 9. Finalize

Stop only when:
- the approved mode was completed cleanly
- any required write phase had explicit approval
- post-implementation review is clean enough
- the skill folder is internally consistent
- referenced files actually exist
- claimed capabilities match the shipped shape
