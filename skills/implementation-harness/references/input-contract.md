# Input Contract

Required input:

- Approved task context:
  - goal
  - non-goals
  - acceptance criteria
  - repo identifier or path context
  - issue URL if one exists
- Approved research packet:
  - closed proposal / approved direction
  - facts
  - evidence
  - risks
  - unresolved blockers status
  - design-test need when relevant
- Approved execution-plan packet:
  - approved file zones or feature slice
  - implementer owners
  - reviewer plan
  - rollback point
  - docs to update
  - design-test status/scope when relevant
  - sensitive-surface handling when relevant
  - request-path / contract touchpoints when relevant

Optional input:

- preferred branch name
- existing implementation constraints
- prior failed attempt notes
- explicit verification expectations

Input assumptions:

- Approval already happened.
- Research is closed enough to implement from without broad rediscovery.
- Execution planning is closed enough to implement from without re-negotiating ownership or scope.
- This skill owns development plus verification handoff, not the independent post-implementation review gate.
- Transport layer may have come from GitHub, linear, docs, or chat; this skill stays transport-agnostic.

If approval status is unclear, the execution-plan packet is missing, file ownership is still ambiguous, or an implementation-critical fact is still missing, stop and return `blocked`.
