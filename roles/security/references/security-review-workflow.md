# Security Review Workflow

Language/framework-specific security guidance now belongs to the `security` reviewer role. The old standalone `security-best-practices` skill was retired; use this role workflow instead.

## Scope

The Security role is a reviewer, not an implementer. It reviews exploitability, auth, injection, secret handling, unsafe parsing, unsafe external sends, data exposure, and trust-boundary regressions.

Security findings may include suggested fixes, but actual code changes route back to the owning implementer role:

- backend/server code -> `backend`
- frontend/client code -> `frontend`
- rendered UI taste -> `frontend taste`
- privacy/retention/local-path leakage where exploitability is not primary -> `privacy/data-safety`

After backend/frontend applies fixes, Security re-reviews the changed slice.

## Required workflow

1. Identify all languages and frameworks in the approved scope.
   - Inspect manifests, imports, routes, middleware, config, server/client boundaries, and touched files.
   - List evidence for the language/framework identification when it affects which reference files are loaded.
2. Load relevant references from this directory.
   - File naming convention: `<language>-<framework>-<stack>-security.md`.
   - Also load matching `<language>-general-<stack>-security.md` when present.
   - For full-stack web apps, load both frontend and backend references when both are in scope.
   - If the frontend framework is unspecified, load `javascript-general-web-frontend-security.md` for browser-side review.
3. Review only the approved slice unless the task explicitly asks for a broader security report.
4. Produce evidence-based findings with concrete exploitability or trust-boundary reasoning.
5. Route fixes to `backend` or `frontend`; do not become the implementer.
6. Re-review after fixes are applied.

## Available references

- `golang-general-backend-security.md`
- `javascript-express-web-server-security.md`
- `javascript-general-web-frontend-security.md`
- `javascript-jquery-web-frontend-security.md`
- `javascript-typescript-nextjs-web-server-security.md`
- `javascript-typescript-react-web-frontend-security.md`
- `javascript-typescript-vue-web-frontend-security.md`
- `python-django-web-server-security.md`
- `python-fastapi-web-server-security.md`
- `python-flask-web-server-security.md`

## Fallback when no matching reference exists

If no concrete reference exists for the detected stack, say so explicitly. You may still flag high-confidence security issues from general security knowledge, but lower confidence for framework-specific guidance and avoid inventing framework rules.

## Finding format

Each finding should include:

- ID
- severity: critical / high / medium / low / informational
- impact: one sentence explaining the abuse or exposure risk
- evidence: `file:line` plus the relevant code/config fact
- reasoning: why this is exploitable or weakens a protection
- suggested fix: concise, implementation-ready guidance
- owner: `backend` or `frontend` when a fix is needed
- re-review trigger: what Security should verify after the fix lands

If no issue is found, state that explicitly for the reviewed scope and mention the references loaded.

## Report mode

When the user asks for a standalone security report, write the report to the requested location. If no location is provided, use `security_best_practices_report.md` in the target repo unless the calling skill specifies another artifact path.

A report should include:

- short executive summary
- prioritized findings grouped by severity
- numeric finding IDs
- `file:line` evidence for code/config claims
- one-sentence impact for critical findings
- suggested fixes and owning implementer role
- any assumptions or controls not visible in the repo that need runtime/infra verification

## Fix routing

Security does not silently implement fixes. For any finding that needs code changes:

1. send the finding to the owning implementer role (`backend` or `frontend`);
2. keep the fix scoped to one finding or a tightly related group;
3. require project-native tests/checks from the implementer;
4. re-review the resulting diff.

## General guidance

- Do not request, output, log, or commit secrets.
- Do not recommend disabling protections to make a bug disappear.
- Treat missing infrastructure controls honestly: if a control may exist outside the repo, report it as not visible and ask to verify runtime/infra config.
- Be careful with TLS-only recommendations in local/dev contexts. Lack of TLS is often out of application scope when a reverse proxy or platform owns TLS. Cookie `Secure` flags and HSTS need deployment-context awareness; HSTS can cause outages if applied casually.
- Avoid public incremental IDs for externally exposed resources when guessing IDs leaks sensitive counts or enables enumeration; prefer random UUIDs or other unguessable IDs where the resource identity is a security boundary.
