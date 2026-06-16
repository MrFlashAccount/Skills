# Documentation review policy

Read this before the first independent review.

Start from a hostile prior: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent bugs. Any FAIL must be evidence-backed with file/function/line or equivalent precise location, and explain why existing tests/checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.

## Must catch

- hidden prerequisites
- missing imports, setup, or glue in examples
- jargon before explanation
- concept order that increases confusion
- quick-start paths polluted by internals
- examples that are longer than they need to be
- sections mixing tutorial, reference, and explanation without intent
- claims of simplicity that the artifact does not earn

## Nice-to-have improvements

- shorten headings
- tighten example choice
- split dense paragraphs
- move advanced caveats lower without hiding important warnings
- make the first win more obvious

## Checkpoint questions

Before finalizing, ask:
- Can a new reader succeed without guessing?
- Does the structure match the chosen doc mode?
- Is the first useful outcome clear?
- Did we explain only what is needed at each step?