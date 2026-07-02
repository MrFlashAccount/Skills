import { DASHBOARD_LANES } from '../contracts/dashboard-contracts.mjs';

const USER_WAITING_STEP = /(user|human|approval|approve|clarification|gate)/i;

export function classifyDashboardLane({ run, baton, degraded } = {}) {
  if (degraded) return DASHBOARD_LANES.DEGRADED;
  if (baton?.status === 'done' || run?.status === 'done') return DASHBOARD_LANES.DONE;
  if (baton?.status === 'blocked' || run?.status === 'blocked') return DASHBOARD_LANES.BLOCKED;
  const cursors = Array.isArray(baton?.cursor) ? baton.cursor : [baton?.cursor];
  if (cursors.some((cursor) => typeof cursor === 'string' && USER_WAITING_STEP.test(cursor))) {
    return DASHBOARD_LANES.WAITING_FOR_USER;
  }
  return DASHBOARD_LANES.WORKER_RUNNING;
}

export function dashboardLaneLabel(lane) {
  return {
    [DASHBOARD_LANES.WAITING_FOR_USER]: 'Waiting for user',
    [DASHBOARD_LANES.WORKER_RUNNING]: 'Worker running',
    [DASHBOARD_LANES.BLOCKED]: 'Blocked',
    [DASHBOARD_LANES.DEGRADED]: 'Degraded',
    [DASHBOARD_LANES.DONE]: 'Done',
  }[lane] ?? 'Worker running';
}
