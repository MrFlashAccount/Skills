import { randomUUID } from 'node:crypto';
import {
  createOrbitaRun,
  cancelOrbitaRun,
  isActiveOrbitaRun,
  isTerminalOrbitaRun,
  ORBITA_RUNTIME_GAP,
  ORBITA_RUN_STATES,
} from '../../entities/orbita-lifecycle/run.mjs';

function compatible(run, { requesterRef, kind } = {}) {
  if (!isActiveOrbitaRun(run)) return false;
  if (requesterRef && run.requester_ref !== requesterRef) return false;
  if (!requesterRef && run.requester_ref) return false;
  if (kind && run.kind && run.kind !== kind) return false;
  return true;
}

function scoped(run, { requesterRef } = {}) {
  if (requesterRef) return run?.requester_ref === requesterRef;
  return !run?.requester_ref;
}

function normalizeLimit(limit, { defaultLimit } = {}) {
  if (limit === undefined || limit === null || limit === '') return defaultLimit;
  const numeric = Number(limit);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
    throw new Error('limit must be a positive integer between 1 and 100');
  }
  return numeric;
}

function storeDiagnostics(store) {
  return typeof store.diagnostics === 'function' ? store.diagnostics() : undefined;
}

export function createOrbitaLifecycleController({ store, now = () => new Date(), idFactory = () => randomUUID() } = {}) {
  if (!store) throw new Error('store is required');

  return {
    async run({ dryRun = false, requesterRef, kind = 'orbita-run', opaqueRefs = {} } = {}) {
      const runs = await store.list();
      const active = runs.filter((run) => compatible(run, { requesterRef, kind }));
      if (!dryRun && active.length === 1) {
        return { ok: true, mode: 'run', run: active[0], activeCount: 1, runtimeGap: active[0].runtime_gap, diagnostics: storeDiagnostics(store), message: 'existing_active_run' };
      }
      if (!dryRun && active.length > 1) {
        return { ok: false, mode: 'run', runs: active, activeCount: active.length, runtimeGap: ORBITA_RUNTIME_GAP, diagnostics: storeDiagnostics(store), message: 'ambiguous_active_runs' };
      }
      const run = createOrbitaRun({ runId: `orbita-${idFactory()}`, requesterRef, kind, now: now(), opaqueRefs, dryRun });
      if (!dryRun) await store.save(run);
      return { ok: true, mode: 'run', run, activeCount: active.length, dryRun, runtimeGap: ORBITA_RUNTIME_GAP, diagnostics: storeDiagnostics(store), message: dryRun ? 'dry_run_ok' : 'created_runtime_gap_run' };
    },

    async status({ runId, requesterRef } = {}) {
      if (runId) {
        const run = await store.get(runId);
        if (!scoped(run, { requesterRef })) return { ok: false, mode: 'status', run: null, diagnostics: storeDiagnostics(store), message: 'run_not_found' };
        return { ok: true, mode: 'status', run, diagnostics: storeDiagnostics(store), message: 'run_status' };
      }
      const active = (await store.list()).filter((run) => scoped(run, { requesterRef }) && isActiveOrbitaRun(run));
      return { ok: active.length <= 1, mode: 'status', run: active[0], runs: active.length > 1 ? active : undefined, activeCount: active.length, diagnostics: storeDiagnostics(store), message: active.length > 1 ? 'ambiguous_active_runs' : 'active_status' };
    },

    async list({ state, limit, requesterRef } = {}) {
      const max = normalizeLimit(limit);
      let runs = (await store.list()).filter((run) => scoped(run, { requesterRef }));
      if (state) runs = runs.filter((run) => run.state === state);
      if (max !== undefined) runs = runs.slice(0, max);
      return { ok: true, mode: 'list', runs, activeCount: runs.filter(isActiveOrbitaRun).length, diagnostics: storeDiagnostics(store) };
    },

    async inbox({ limit, requesterRef } = {}) {
      const max = normalizeLimit(limit);
      let runs = (await store.list()).filter((run) => scoped(run, { requesterRef }) && (run.delivery?.requires_parent_delivery === true || run.state === ORBITA_RUN_STATES.WAITING_HUMAN));
      if (max !== undefined) runs = runs.slice(0, max);
      return { ok: true, mode: 'inbox', runs, activeCount: runs.length, runtimeGap: ORBITA_RUNTIME_GAP, diagnostics: storeDiagnostics(store) };
    },

    async cancel({ runId, reason, requesterRef } = {}) {
      if (!runId) throw new Error('run id is required');
      const existing = await store.get(runId);
      if (!existing || !scoped(existing, { requesterRef })) return { ok: false, mode: 'cancel', run: null, diagnostics: storeDiagnostics(store), message: 'run_not_found' };
      if (isTerminalOrbitaRun(existing)) return { ok: true, mode: 'cancel', run: existing, diagnostics: storeDiagnostics(store), message: 'already_terminal' };
      const run = cancelOrbitaRun(existing, { reason, now: now() });
      await store.save(run);
      return { ok: true, mode: 'cancel', run, diagnostics: storeDiagnostics(store), message: 'cancelled' };
    },
  };
}
