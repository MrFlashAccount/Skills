# Dashboard context

`lib/dashboard/**` owns the read-only Orbita dashboard observer subsystem.
It observes durable workflow-runner state, projects safe dashboard DTOs, serves
a local read-only API/event/static surface, and renders the browser board UI.

This context implements the dashboard section of `../../ARCHITECTURE.md` and
uses `../../DESIGN.md` as the board/drawer UI input.

## Source zones

- `contracts/**` owns browser-visible dashboard DTO names, lane/event constants,
  allowed fields, and contract fixtures/examples.
- `projection/**` owns safe read models, lane classification, history excerpt
  policy, workflow mini-map projection, artifact/result summaries, and degraded
  read diagnostics.
- `server/**` owns the local daemon request handler, list/detail/SSE/static
  surfaces, watch/poll refresh, restart rebuild behavior, public error shape,
  and per-run read isolation.
- `ui/**` owns browser rendering and browser API/SSE consumption from dashboard
  DTOs only.

## Binding rules

- Dashboard code is read-only. It must not write run directories, mutate baton
  or history, acquire or refresh leases, advance workflow cursors, or repair
  run state.
- `contracts/**` is the shared source for the browser-visible DTO surface. The
  server, projection, UI fixtures, and renderer must agree on the same list,
  detail, event, degraded diagnostic, artifact, history excerpt, cursor, and
  mini-map shapes.
- `projection/**` may read validated records and plain values supplied by
  adapters, then return allowlisted DTOs. It must not parse CLI arguments,
  inspect process state, perform filesystem IO, or call runner mutation/control
  use cases.
- `server/**` may perform read-only filesystem/API/static IO and response
  formatting. It must route all browser-visible run data through the safe
  projection/contract boundary.
- `ui/**` must depend only on browser APIs and dashboard DTO contracts. It must
  not import Node filesystem modules, persistence adapters, workflow-runner API
  shells, CLI modules, use cases, or entity internals.
- Degraded dashboard state describes observer/read health only. It must stay
  ephemeral and must not be persisted as workflow state or represented as a
  workflow blocked result unless durable state is actually blocked.
- SSE updates are observational and lossy. Connected clients must not create
  backpressure into workflow execution or make runner writes depend on UI state.

## Forbidden dependencies and fields

Dashboard runtime code must not import, execute, shell out to, expose, or wrap:

- workflow-runner `next`, `continue`, `write-output`, `instructions`, or
  `bind-agent` command surfaces;
- run claiming, lease authority, heartbeat, lock mutation, or persisted-state
  writer code;
- host worker lifecycle/session concepts;
- token-bearing command builders or raw instruction command builders.

Browser-visible DTOs and UI fixtures must not include:

- lease tokens, token hashes, token-bearing commands, or raw instruction
  commands;
- private prompts, hidden transcripts, instruction storage paths, preferred
  agent ids, bind-agent commands, or worker lifecycle metadata;
- raw baton, raw history, raw artifact filesystem paths, local runs-root paths,
  or absolute user-machine paths;
- unallowlisted owner/user/request metadata.

## Review checks

Dashboard changes must include focused evidence for:

- no runner mutation/control imports or command strings in dashboard runtime
  code;
- safe DTO redaction for forbidden fields above;
- per-run degraded read isolation without hiding healthy runs;
- restart rebuild from durable state;
- SSE/poll recovery without execution backpressure;
- UI rendering from daemon DTOs or an explicitly named adapter over those DTOs;
- no control affordances, drag/drop, manual lane movement, or browser direct
  filesystem reads.
