# Lessons

Append durable lessons, pitfalls, and anti-patterns that should influence future work.

Format:
- YYYY-MM-DD — title: note

- 2026-04-23 — orchestration discipline: do not run the full subagent/review pipeline for trivial fixes; keep the harness proportional to task complexity.
- 2026-04-23 — review hygiene: the review phase belongs after subagent output, with fixes routed back through the same orchestration loop instead of handling review as an afterthought.
- 2026-04-23 — critic behavior: effective critique includes simplification and optimization pressure, not just defect hunting.
- 2026-04-23 — review orchestrator parity: review tooling should match the harness loop so the same findings can be rechecked in later passes.
- 2026-04-23 — review minimum: even tiny code changes should still pass through a lightweight review gate.
- 2026-04-23 — orchestration discipline: the harness should stay an orchestrator only; even trivial fixes should go through a subagent, not be edited by hand.
- 2026-04-23 — workflow split: planning critique and implementation review are separate phases, with different tooling and different jobs.
- 2026-04-23 — approval discipline: after showing the proposal, the harness must stop and wait for explicit user approval before any implementation starts.
