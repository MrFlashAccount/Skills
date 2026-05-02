# Testing

Use this when validating or revising `github-ticket-intake`.

## Trigger prompts

- Turn this rough note into a GitHub issue for repo X.
- Break this feature idea into one issue with a checklist.
- Split this into 2–3 GitHub tickets and link them.
- Create the issue now in owner/repo and add it to project Y.
- Оформи в гитхабе и закинь на борду.
- Добавь на борду и пусти дальше по процессу.
- Draft the ticket package first; do not write to GitHub yet.
- I pasted a transcribed voice note — turn it into tracked GitHub work.

## Paraphrase prompts

- Can you shape this into GitHub issues?
- Make this a tracked issue with sane labels and project placement.
- Закинь в таски, чтобы оно пошло по обычному флоу.
- This note is messy; convert it into one ticket or split it if needed.
- I am not sure which repo this belongs to; tell me whether you need one clarification or can draft it first.

## Out-of-scope prompts

- Transcribe this voice note.
- Research the solution before making tickets.
- Implement this change in the repo.
- Review my PR and tell me what to fix.
- Set up GitHub webhooks or automate repo triage.
- Clean up labels and repo settings across GitHub.

## Smoke tests

### Manual template use

Read `templates/default.md` or `templates/brief.md`, then hand-write a body from one of them.

Confirm that:
- templates are plain markdown guidance files
- the assistant, not a script, chooses the template and fills the body

### Write-ready preflight

```bash
node scripts/gh-preflight.mjs <owner> [project-number]
```

Expected result:
- `gh auth status` succeeds
- if a project number is given, project access succeeds too

### Linked-set smoke shape

```bash
cat <<'JSON' | node scripts/create-linked-set.mjs --dry-run
{
  "repo": "owner/repo",
  "issues": [
    {
      "title": "Parent issue",
      "body": "## Summary\nParent issue body\n\n## Checklist\n- [ ] Parent task",
      "role": "parent"
    },
    {
      "title": "Child issue",
      "body": "## Problem\nChild issue body\n\n## Delivery checklist\n- [ ] Child task",
      "role": "child"
    }
  ]
}
JSON
```

Confirm that the output shape is:
- both issues are present
- the parent body gets a child link
- the child body gets a parent link
- the returned bodies preserve the pre-rendered markdown and only append related links
- the returned summary contains both URLs

## With-skill vs without-skill comparison

Use one real rough note and compare:
- without the skill: does the intake drift into research or execution?
- with the skill: does it classify board/taskflow wording as workflow intent, require known project placement when mapped, and hand off after create + board placement?

This skill is better only if it keeps the boundary sharp while still producing usable tickets.
