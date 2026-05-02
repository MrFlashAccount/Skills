# Input Contract

Required input:

- Approved task context:
  - goal
  - non-goals
  - acceptance criteria
  - approved file zones or feature slice
  - repo identifier or path context
  - issue URL if one exists
- Research packet:
  - closed proposal / approved direction
  - facts
  - evidence
  - risks
  - unknowns
  - contract or dependency notes when relevant

Optional input:

- preferred branch name
- reviewer hints
- existing implementation constraints
- prior failed attempt notes

Input assumptions:

- Approval already happened.
- Research is closed enough to implement from without broad rediscovery.
- Transport layer may have come from GitHub, linear, docs, or chat; this skill stays transport-agnostic.

If approval status is unclear, or the research packet lacks enough evidence to choose file ownership safely, or an implementation-critical fact is still missing, stop and return `blocked`.
