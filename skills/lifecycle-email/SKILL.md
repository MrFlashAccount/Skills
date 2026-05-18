---
name: lifecycle-email
description: Plan, draft, or improve warm email sequences tied to product, customer, or campaign lifecycle moments. Use when the user asks for welcome emails, onboarding emails, nurture drips, activation flows, launch follow-up, re-engagement, win-back, upgrade prompts, retention emails, or trigger-based lifecycle messaging. Do not use for unsolicited prospecting or SDR outreach; use cold-email for that.
---

# Lifecycle Email

Use this skill when the audience already has some relationship to the product, company, list, or campaign.

The job is to design a sequence that matches the user's actual stage, timing, trust level, and next best action instead of sending generic email volume.

## Read order

1. Read `../../shared/go-to-market-context/README.md` when product reality, audience, proof, or claim limits are not already clear.
2. Read `../../roles/marketing/ROLE.md`.
3. Read `../../roles/marketing/RUBRIC.md`.
4. Read `../../roles/marketing/LEARNINGS.md`.
5. Read `references/sequence-design.md`.

## Routing boundary

Use this skill for:
- welcome and activation sequences
- onboarding or setup-support emails
- nurture drips after signup, content download, trial, webinar, or demo interest
- upgrade, expansion, renewal, win-back, and re-engagement flows
- launch follow-up and campaign email sequences
- lifecycle email audits where timing, segmentation, or message hierarchy are weak

Do not use this skill for:
- cold outbound to net-new prospects -> `cold-email`
- in-app onboarding design when email is secondary and product flow is the main artifact -> coordinate with the product/docs owner
- standalone site or landing-page copy -> hand off to the appropriate copy/docs owner

## Inputs to gather

Start from the triggering moment:
- who is entering the flow and what action or state puts them there
- what they already know, have done, or have not done
- the next best action and what blocks it
- proof, assets, or product truths that can move them forward
- send constraints, suppression rules, exit conditions, and channel overlap

When the audience, trigger, or goal are ambiguous, clarify those first. Everything else can often be inferred or marked as an open question.

## Workflow

1. **Classify the lifecycle motion**
   - welcome / activation
   - onboarding / adoption
   - nurture / education
   - upgrade / expansion
   - re-engagement / win-back
   - launch / campaign follow-up
2. **Map the stage logic**
   - entry trigger
   - audience state
   - desired conversion or behavior change
   - exit conditions and suppression logic
3. **Design the sequence arc**
   - one job per email
   - timing that fits urgency and trust level
   - strongest message first
   - proof or support inserted where doubt is highest
4. **Draft the asset**
   - sequence overview
   - per-email subject, goal, CTA, and copy or copy skeleton
   - segmentation or branching notes when relevant
5. **Run the quality gate**
   - are we sending helpful emails, not just more emails?
   - does each email match the recipient's stage?
   - is the sequence coordinated with product, sales, docs, or support surfaces?
   - are claims, incentives, and urgency honest?
6. **Package optimization notes**
   - experiments to run
   - missing data or proof
   - required handoffs for docs, DevRel, sales, or product

## Output contract

Return the smallest complete artifact for the ask. Typical outputs:
- sequence strategy brief
- trigger / audience / exit-condition map
- email-by-email outline
- full draft copy for some or all emails
- audit notes on timing, segmentation, overlap, or CTA problems
- test plan for subject lines, sequencing, or branching

Default sequence format:

```md
Sequence:
Audience:
Entry trigger:
Primary goal:
Exit conditions:

Email 1 - [timing]
Job:
Subject options:
CTA:
Copy:

Email 2 - [timing]
...
```

## Handoffs

- **Docs owner**: when activation or onboarding emails depend on missing setup docs, tutorials, migration help, or proof pages.
- **DevRel owner**: when the lifecycle audience is primarily technical and the message must lean on repository, API, release, or implementation trust.
- **Sales owner**: when the flow crosses into MQL/SQL follow-up, expansion qualification, renewal risk handling, or objection-heavy human follow-up.

## Rules

- Sequence around the recipient's stage, not internal calendar habits.
- One email, one job.
- Match cadence to urgency; do not over-send because automation makes it easy.
- Coordinate with in-product, support, and sales touches so the recipient is not asked the same thing everywhere.
- Keep proof and claims grounded in current reality.
- Preserve segmentation gaps and unknowns explicitly.
