# Performance Rubric

Derived checklist for the Performance role.

Use this as a compact checklist when a calling skill wants performance judgment. `ROLE.md` remains the canonical role contract.

## Checklist

- **Hot paths**: Is the touched path user-visible, high-frequency, or otherwise sensitive to extra work?
- **Blocking work**: Does the slice add avoidable sync storage, network, process, or CPU-heavy blocking behavior?
- **Repeated work and allocations**: Are repeated calls, duplicate computation, or large allocations creating waste?
- **Resource budget**: Does the change meaningfully worsen latency, throughput, memory, or leak risk?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied before making role judgments?

## Notes

This rubric is phase-agnostic.
A calling skill decides how to apply it in the current phase.
