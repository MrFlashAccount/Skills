# Go-To-Market Context Reference Package

`shared/go-to-market-context` is reusable foundation material for roles and skills that need stable product, audience, and messaging context before writing, reviewing, or planning go-to-market work.

It is not a runnable skill and intentionally has no `SKILL.md`.

Use it when the task needs a shared source of truth for:
- product overview and current capability boundaries
- audience / ICP and jobs to be done
- pains, alternatives, and competitive landscape
- differentiation, proof points, and objections
- messaging hierarchy and claim discipline

Do not use it as a substitute for task-specific execution. It is foundation context, not a workflow.

## Canonical sections

Capture or infer these sections from evidence when possible. Leave open questions explicit instead of faking certainty.

| Section | What it should clarify |
| --- | --- |
| Product overview | What the product is, what it does now, category, pricing/packaging, and important capability constraints |
| Audience / ICP | Who it is for, buying context, target company/user shape, and who feels the pain most |
| Jobs to be done | What customers are actually hiring it for, in concrete before/after terms |
| Pains and stakes | Frictions, costs, risks, and emotional pressure in the current state |
| Alternatives / competitors | Direct competitors, indirect alternatives, and status-quo behaviors being displaced |
| Differentiation | Why this product wins for the right customer and where it should not overclaim |
| Objections | Likely concerns, adoption fears, fit questions, and proof needed to answer them |
| Proof points | Evidence, customer results, demos, technical truths, examples, logos, or constraints that support claims |
| Messaging hierarchy | Primary promise, supporting messages, priority order, and which ideas deserve the first screen |
| Constraints | Compliance, trust, technical reality, pricing, market, and brand limits that shape messaging |
| Open questions | Unknowns that still block strong positioning or copy decisions |

## Operating rules

- Evidence before claims.
- Keep current capability separate from roadmap or aspiration.
- Prefer customer language over invented category jargon.
- Name the real alternative, including spreadsheets, services, and doing nothing.
- Keep target-fit explicit; not every product is for everyone.
- Preserve open questions when proof is missing.

## How roles should use this package

- **Marketing**: treat this as the default planning and messaging foundation before positioning, campaign framing, landing-page direction, launch framing, or objection handling.
- **DevRel**: use this when developer-facing framing needs broader audience/product context, then adapt it for developer trust, technical proof, and repository entrypoint needs.
- **Other roles**: load only when product/audience/messaging context materially changes judgment.

## Referencing from skills or roles

From a skill under `skills/<name>/`:

```markdown
Load `../../shared/go-to-market-context/README.md` before doing positioning or messaging work that depends on product and audience context.
```

From a role under `roles/<name>/`:

```markdown
Load `../../shared/go-to-market-context/README.md` when the task needs shared GTM/product messaging context.
```

## Boundary

- `roles/marketing` owns marketing judgment built on top of this foundation.
- `roles/dev-rel` owns developer-facing framing built on top of this foundation.
- `shared/go-to-market-context` owns neither workflow nor final artifact quality by itself.
