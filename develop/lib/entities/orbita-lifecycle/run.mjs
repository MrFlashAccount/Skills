const ACTIVE_STATES = new Set(['created', 'waiting_human', 'running']);
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'failed']);

export const ORBITA_RUNTIME_GAP = 'requires_parent_delivery';
export const ORBITA_RUN_STATES = Object.freeze({
  CREATED: 'created',
  WAITING_HUMAN: 'waiting_human',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

export function isActiveOrbitaRun(run) {
  return Boolean(run && ACTIVE_STATES.has(run.state));
}

export function isTerminalOrbitaRun(run) {
  return Boolean(run && TERMINAL_STATES.has(run.state));
}

export function createOrbitaRun({ runId, requesterRef, kind = 'orbita-run', now = new Date(), opaqueRefs = {}, dryRun = false, intake, state } = {}) {
  if (!runId || typeof runId !== 'string') throw new Error('runId is required');
  const timestamp = new Date(now).toISOString();
  return {
    schema_version: 1,
    run_id: runId,
    kind,
    state: state ?? (dryRun ? ORBITA_RUN_STATES.COMPLETED : ORBITA_RUN_STATES.CREATED),
    requester_ref: requesterRef,
    runtime_gap: ORBITA_RUNTIME_GAP,
    delivery: {
      status: ORBITA_RUNTIME_GAP,
      requires_parent_delivery: true,
    },
    intake,
    opaque_refs: opaqueRefs && typeof opaqueRefs === 'object' ? { ...opaqueRefs } : {},
    created_at: timestamp,
    updated_at: timestamp,
    revision: 1,
  };
}

export function cancelOrbitaRun(run, { reason, now = new Date() } = {}) {
  if (!run) throw new Error('run is required');
  if (isTerminalOrbitaRun(run)) return { ...run };
  return {
    ...run,
    state: ORBITA_RUN_STATES.CANCELLED,
    cancel_reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : undefined,
    updated_at: new Date(now).toISOString(),
    revision: Number(run.revision || 0) + 1,
  };
}
