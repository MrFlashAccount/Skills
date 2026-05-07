# SPDD-lite

Lightweight process for AI-assisted workflow design. Goal: enough structure to reduce rework, stale assumptions, and unsafe drift without turning design work into ceremony.

## Principles
- Keep artifacts short, live, and disposable.
- Scale process to risk, not habit.
- Prefer explicit assumptions over hidden ones.
- Re-sync when reality changes.
- Candidate additions are selective. Nothing here is mandatory by default beyond what the current risk level justifies.

## Core artifacts
- Brief / task contract: problem, scope, constraints, success bar, non-goals.
- Research packet: only the facts, examples, links, and references needed for this slice.
- Assumption ledger: what is assumed, confidence, expiry trigger, owner to verify.
- Decision record: what changed, why, what alternatives were rejected.
- Learnings / negative-pattern capture: what worked, what caused churn, what to avoid next time.

## Risk scale
- Tiny: fully local, reversible, low-cost, no user/system risk.
- Bounded: limited blast radius, some cross-file or workflow impact, still easy to reason about.
- Risky: meaningful user, system, data, or coordination risk.
- Infrastructure-grade: foundational workflow/process changes with broad or durable impact.

## Non-trivial boundary
Non-trivial starts at `Bounded`.

`Tiny` work may skip explicit approval only when all are true:
- fully local
- reversible
- not user-risky
- not system-risky

Anything `Bounded` or above needs approval before non-trivial implementation.

## Core loop
1. Frame the slice with a brief/task contract.
2. Gather just-enough research into a packet.
3. Mark assumptions explicitly.
4. Get approval before non-trivial implementation.
5. Implement the smallest useful slice.
6. Run the smallest meaningful verification.
7. Do a freshness/staleness pass:
   - did requirements, facts, dependencies, or environment shift while working?
8. Sync back when reality changed:
   - update brief, assumptions, decision record, and next step
9. Capture learnings only when they would likely prevent repeat churn.

## Unknown handling
When something is unknown, choose one path explicitly:

- Verify now:
  Use when the fact is cheap to check, safety-relevant, or likely to change the approach.
- Proceed provisionally:
  Use when the assumption is low-risk and easy to unwind. Record the assumption and trigger for re-check.
- Stop / escalate:
  Use when uncertainty changes scope, risk, ownership, or safety enough that continuing would be guesswork.

Simple rule:
- cheap + important -> verify now
- low-risk + reversible -> proceed provisionally
- high-impact + ambiguous -> stop / escalate

## Verification rule
Always do the smallest meaningful verification for the slice.

Examples:
- docs slice -> link/path/render check
- prompt/workflow tweak -> one representative dry run
- logic change -> focused test or direct execution
- infrastructure-grade change -> targeted checks plus rollback clarity

## Freshness and sync-back
Before closing a slice, ask:
- Is any research stale?
- Did implementation reveal a false assumption?
- Did scope or risk move up?
- Does the user or system now need a different recommendation?

If yes, sync back:
- state what changed
- update the artifact that is now wrong
- re-approve if the slice is now `Bounded`+ in a new way

## Process knobs
Tune these per slice instead of adopting all structure by default:
- Artifact depth: one-line notes vs short structured entries
- Approval strictness: inline ack vs explicit checkpoint
- Research depth: one source vs small packet
- Assumption rigor: only critical assumptions vs fuller ledger
- Verification depth: smoke check vs focused suite
- Learning capture: skip unless repeat value is clear

Suggested defaults:
- Tiny -> minimal notes, optional decision record, smoke verification
- Bounded -> short contract, explicit approval, focused assumptions, small verification
- Risky -> tighter decision record, explicit unknown policy, stronger verification
- Infrastructure-grade -> durable decision log, deliberate sync-back, staged verification

## Minimal templates

### 1. Brief / task contract
```md
Problem:
Scope:
Constraints:
Success bar:
Non-goals:
Risk level: Tiny | Bounded | Risky | Infrastructure-grade
```

### 2. Assumption ledger
```md
- Assumption: API shape is unchanged this week
  Confidence: medium
  Plan: proceed provisionally
  Re-check trigger: integration fails or source date looks stale
```

### 3. Decision + learning note
```md
Decision: keep workflow single-pass with explicit approval gate at Bounded+
Why: reduces silent drift without slowing Tiny local work
Rejected: approval for every edit; too ceremonial
Learning: stale context caused more churn than missing templates
```
