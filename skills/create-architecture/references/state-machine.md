# Create-Architecture State Machine

Use this file when the work risks sliding from diagnosis into premature artifact writing.

## States

1. `source-audit`
2. `grilling`
3. `option-narrowing`
4. `proposal-ready`
5. `architect-reviewed`
6. `critic-pressured`
7. `awaiting-approval`
8. `implementation`
9. `post-review`
10. `done`

## Allowed transitions

- `source-audit` -> `grilling`
- `grilling` -> `option-narrowing`
- `option-narrowing` -> `proposal-ready`
- `proposal-ready` -> `architect-reviewed`
- `architect-reviewed` -> `critic-pressured`
- `critic-pressured` -> `proposal-ready` when flaws require revision
- `critic-pressured` -> `awaiting-approval` when the proposal survives pressure
- `awaiting-approval` -> `implementation` only after explicit approval
- `implementation` -> `post-review`
- `post-review` -> `implementation` when fixes are still required
- `post-review` -> `done` when both architect and critic lenses pass

## Not allowed

- `source-audit` -> `implementation`
- `grilling` -> canonical artifact writing
- `option-narrowing` -> final ADR/C4/DDD docs
- `proposal-ready` -> `done`
- `awaiting-approval` -> `done`

## Canonical artifact lock

Before `implementation`, do not write:
- final architecture decision docs
- final C4 artifacts
- final strategic or tactical DDD docs
- final ports-and-adapters / dependency-rule artifacts
- final `ARCHITECTURE.md`
- final local `CONTEXT.md` docs

Lightweight sketches are allowed only when clearly marked as proposal material rather than canonical architecture output.

## Use this state machine when

- the user asks for architecture and implementation in one breath
- the repo is tempting you to document the current state too early
- multiple options are plausible
- the architecture package is large enough that approval needs a stable proposal target
