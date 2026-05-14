# Workflow

This skill is the intake path for turning raw work requests into GitHub issues and, when implied, into the normal tracked GitHub workflow.

## Mode 1: Draft only

Use when:
- the user wants the ticket package shaped first
- repo or board details are missing
- you need Sergey to confirm wording, split, scope, or target

Steps:
1. Build the task contract.
2. Decide whether this is one ticket, one ticket with a checklist, or a small ticket set.
3. Produce the issue-title candidate or ticket split, summary, checklist, labels, and board recommendation.
4. Stop without external writes.

## Mode 2: Write ready

Use when:
- the user clearly wants the issue/card created now, or clearly wants the work put onto the normal tracked board/taskflow now
- repo target is known
- GitHub auth is available
- if project placement is part of the ask or implied by workflow intent, project access is available too

Steps:
1. Build the task contract.
2. Resolve destination in order:
   - repo known?
   - does the ask imply artifact-only creation, workflow placement, or workflow handoff?
   - project placement required or optional?
   - if required, is the project known?
   - write now, or draft first?
3. Decide whether this is one ticket, one ticket with a checklist, or a small linked set.
4. Choose the markdown template manually from `templates/` if needed, then write the final issue body or bodies yourself.
5. Run [scripts/gh-preflight.mjs](scripts/gh-preflight.mjs) for auth sanity, and for project sanity when project placement is required.
6. Create the issue with `create-issue.mjs` for one issue or one issue with a checklist. The script only writes the body you pass on stdin.
7. Create the ticket set with `create-linked-set.mjs` when the shape is a small linked set. Each issue must already contain a final `body`; the script only creates issues then backfills relation links.
8. Add each created issue to the project board when project placement is explicitly requested or implied by workflow intent, and the target project is known.
9. Return titles, labels, URLs, project target if used, and blockers if any destination step stopped the write path.
10. If the request implies "put this into the workflow", hand off automatically to the configured next research or reviewer stage after create + required board placement. If the request is artifact-only, hand off only when the user explicitly asks for the next polling or reviewer stage.

## Destination resolution guidance

- Repo known, no board requested -> issue creation may proceed.
- Repo known, workflow/board intent present, default mapping exists -> use that mapping and treat board placement as required.
- Repo known, board requested but unknown -> ask one short clarification or stay `draft-only`.
- Repo known, workflow/board intent present, mapping unknown -> stay `draft-only`; do not silently downgrade to issue-only.
- One clear project -> create there.
- Several plausible projects, but one dominant -> ask one short clarification before writing.
- Several real owners or domains -> split into linked tickets or use one coordination ticket plus linked project tickets.
- No confident mapping -> stay `draft-only`; do not guess.

## Linked ticket strategy

- If one issue is marked as `parent`, create the whole set first, then backfill parent/child links into the issue bodies.
- If there is no parent, treat the set as sibling tickets and backfill a simple related-issues list into each body.
- Backfill means appending a `## Related issues` section after issue URLs exist; body drafting still belongs to the agent.
- Keep the set small. If linking logic needs a complex graph, the request is outside this skill's happy path.

## Decomposition guidance

Good splits:
- each ticket is a real tracked unit
- one ticket has one clear outcome
- links between tickets are meaningful, not decorative
- splitting gives better tracking than a single checklist would
- the linking strategy is simple enough to explain in one sentence: parent/children or related siblings

Bad splits:
- one ticket per tiny thought
- fake hierarchy where a checklist would be enough
- status fluff
- implementation trivia that belongs only inside a later coding brief
- drifting into later-stage research/program design that belongs outside this intake skill

## Output shape

Always return:
- title or ticket set
- repo
- project target if used
- labels
- checklist or split
- created URLs or blockers

## Anti-patterns

Do not:
- make the issue body read like a meeting transcript
- overfit to the original wording if a clearer issue title exists
- create tickets before the task boundary is sane
- silently choose a repo when the request is ambiguous
- drift into Vikra research, implementation orchestration, or PR lifecycle work
- treat workflow-placement wording as plain issue creation when a known board mapping exists
- claim there is a deterministic update path unless the flow actually provides one
