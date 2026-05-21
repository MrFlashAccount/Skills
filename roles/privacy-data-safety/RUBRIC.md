# Privacy / Data-Safety Rubric

Derived checklist for the Privacy / Data-Safety role.

Use this as a compact checklist when a calling skill wants privacy / data-safety judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Local/private content exposure**: Does the slice expose local paths, personal docs, prompts, examples, or other repo-visible private material?
- **Retention and consent**: Is user data stored, copied, or reused in ways that violate intended consent or retention boundaries?
- **Operational data handling**: Are logs, fixtures, examples, and outputs safe to keep in the repo or visible workflow?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides how to apply it in the current phase.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/privacy-data-safety/RUBRIC.md`

Only list this file if it was actually loaded.
