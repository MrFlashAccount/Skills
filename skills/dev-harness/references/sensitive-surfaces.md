# Sensitive Surfaces

Use this file when a slice might leak, retain, or expose user/private data even if it does not look like classic auth/security work.

## Classify as `sensitive-surface`

Mark the slice as `sensitive-surface` if it touches any of:
- local filesystem paths or machine-specific storage assumptions
- personal docs such as resumes, CVs, notes, exports, screenshots, transcripts, PDFs, or audio
- `references/`, `assets/`, prompts/examples, fixtures, logs, or traces that may contain real user content
- `private/` folders or any retained user data
- external sends, webhooks, or publishing paths that may carry user/private content
- secrets, tokens, cookies, sessions, or auth state
- consent/retention rules for uploaded or pasted user material

If you are unsure, classify it as `sensitive-surface`.

## Proposal requirements

Before approval, the proposal must answer:
- what sensitive inputs exist
- whether anything will be persisted
- where exposure could happen (repo, logs, outputs, external sends, examples, docs)
- which reviewer(s) must clear the slice

If persistence is involved, say whether it is:
- current-task only
- reusable local storage
- external/remote storage

If storage is not current-task only, require explicit user consent.

## Review requirements

For `sensitive-surface` work:
- run `scripts/check_sensitive_surface.py <repo-path> [<base-rev>]`
- run `privacy/data-safety` review before calling the slice done
- add `security` too when exploitability, auth, trust boundaries, or secret handling are also in play
- the slice is not clean until scanner findings are resolved or explicitly dispositioned

## Safe defaults

Prefer these defaults unless the approved slice says otherwise:
- relative lookup, not absolute machine-specific paths
- `private/` + `.gitignore` for local retained personal material
- no repo-visible real user docs in `references/`, `assets/`, examples, fixtures, or logs
- no user-facing mention of internal storage paths unless the user explicitly asks
- no persistence of uploaded user files without explicit consent
- current-task use only when retention is not clearly required
