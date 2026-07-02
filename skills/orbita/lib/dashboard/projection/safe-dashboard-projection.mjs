import { DASHBOARD_LANES } from '../contracts/dashboard-contracts.mjs';
import { buildHistoryExcerpt } from './history-excerpt-policy.mjs';
import { classifyDashboardLane, dashboardLaneLabel } from './lane-classifier.mjs';

function pruneUndefined(value) {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

function cursorProjection(cursor) {
  const steps = Array.isArray(cursor) ? [...new Set(cursor)] : (typeof cursor === 'string' ? [cursor] : []);
  return {
    kind: steps.length > 1 ? 'parallel' : 'single',
    steps,
    display: steps.join(' + '),
  };
}

function occupancyProjection(workerLease, now) {
  if (!workerLease?.leaseExpiresAt) return { state: 'unclaimed' };
  const leaseExpiresAt = workerLease.leaseExpiresAt;
  return {
    state: Date.parse(leaseExpiresAt) > now.getTime() ? 'occupied' : 'stale',
    leaseExpiresAt,
  };
}

function artifactProjection(entry) {
  const artifact = entry?.artifact ?? entry;
  return pruneUndefined({
    producerStepId: entry?.producerStepId,
    id: artifact?.id,
    contentType: artifact?.content_type,
    summary: artifact?.summary,
  });
}

function resultProjection(result) {
  return pruneUndefined({
    type: result?.type,
    cursor: result?.cursor,
    outcome: result?.outcome,
    summary: result?.summary,
    ref: result?.ref,
  });
}

function stateStepKeys(state) {
  if (!state || typeof state !== 'object') return [];
  return Object.keys(state)
    .filter((key) => !['artifacts', 'results', 'attempts'].includes(key))
    .sort();
}

function miniMapProjection({ state, cursor }) {
  return {
    currentSteps: cursorProjection(cursor).steps,
    completedSteps: stateStepKeys(state),
    provenance: 'baton.state step outputs and baton.cursor',
  };
}

function baseRunProjection(run, { now = new Date() } = {}) {
  return pruneUndefined({
    runId: run.runId,
    title: run.title,
    summary: run.summary,
    workflow: pruneUndefined({ identity: run.workflow?.identity }),
    status: run.status,
    occupancy: occupancyProjection(run.workerLease, now),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  });
}

export function projectDashboardRun({ run, persistedState, degraded }, { now = new Date(), includeDetail = false } = {}) {
  const baton = persistedState?.baton;
  const lane = classifyDashboardLane({ run, baton, degraded });
  const state = baton?.state ?? {};
  const projection = {
    ...baseRunProjection(run, { now }),
    status: baton?.status ?? run.status,
    lane: { id: lane, label: dashboardLaneLabel(lane) },
    cursor: cursorProjection(baton?.cursor),
    artifacts: Array.isArray(state.artifacts) ? state.artifacts.map(artifactProjection) : [],
    results: Array.isArray(state.results) ? state.results.map(resultProjection) : [],
    miniMap: miniMapProjection({ state, cursor: baton?.cursor }),
  };
  if (includeDetail) projection.historyExcerpt = buildHistoryExcerpt(persistedState?.history);
  if (degraded) {
    projection.degraded = {
      reason: degraded.reason,
      message: degraded.message,
    };
    projection.lane = { id: DASHBOARD_LANES.DEGRADED, label: dashboardLaneLabel(DASHBOARD_LANES.DEGRADED) };
  }
  return projection;
}
