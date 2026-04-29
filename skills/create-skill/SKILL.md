---
name: create-skill
description: Turn a raw idea, PDF, SOP, workflow, or prompt collection into a well-structured Claude/OpenClaw skill. Use when creating a new skill, converting existing documentation into a source-first skill folder, improving SKILL.md metadata, deciding what belongs in SKILL.md vs references/scripts/assets, or reviewing whether a skill is complete and runnable in a source-only repo.
---

Turn this source material into a real source-first skill folder.

This is execution stage, not initial discovery stage.
If scope is still fuzzy, use `grill-me` first to determine what actually needs to be built. Start this skill only after the target skill shape is clear enough to execute.

After scoping and before any real skill implementation work, stop and wait for the user's explicit `ПОДТВЕРЖДАЮ`.
Do not draft files, create the skill structure, or start fix/review passes before that approval.

Work from concrete usage, not abstract summaries.

1. Reduce the scoped source into 3-5 representative user asks.
2. Define success criteria before writing:
   - trigger on relevant asks
   - avoid unrelated over-triggering
   - complete the workflow cleanly
   - survive paraphrases and real-task tests
3. Build the smallest useful skill structure:
   - `SKILL.md` for trigger metadata and the default operating flow
   - `references/` for bulky or variant-specific detail
   - `scripts/` for repeated deterministic work
   - `assets/` only for output resources
4. Keep `SKILL.md` lean. Move everything non-core out of the always-loaded file.
5. If the skill touches personal docs, local paths, prompts/examples, logs, or retained user data, treat it as a sensitive surface: redact aggressively, prefer local-only/private storage, and require privacy/data-safety review before calling it done.
6. Write frontmatter carefully:
   - `name`: short, lowercase, hyphenated
   - `description`: what the skill does, when it should trigger, and likely user phrasings
   - fail if the description is generic, missing trigger language, contains `<` or `>`, or is too long
7. Write the body as direct operating instructions.
8. Run a critic/fix loop after the first draft:
   - 2 review/fix iterations by default
   - 3 iterations when the skill is high-risk, bloated, or still ambiguous after round 2
9. Review and test before calling it done.

Read `references/workflow.md` for the full conversion flow.
Read `references/checklist.md` before final review and after each review pass.
Read `references/testing-and-troubleshooting.md` when checking trigger quality, frontmatter failure modes, or test coverage.

Ask one blocking question at a time.
If the answer can be recovered from the source material or repo, inspect that instead of asking.
