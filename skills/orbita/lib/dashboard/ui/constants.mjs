export const dashboardLanes = [
  { id: 'waiting_for_user', label: 'Waiting for user', tone: 'waiting' },
  { id: 'worker_running', label: 'Worker running', tone: 'running' },
  { id: 'blocked', label: 'Blocked', tone: 'blocked' },
  { id: 'degraded', label: 'Degraded', tone: 'degraded' },
  { id: 'done', label: 'Done', tone: 'done' },
];

export const dashboardLaneIds = new Set(dashboardLanes.map((lane) => lane.id));

export const fallbackLaneId = 'degraded';

export const dashboardCopy = {
  emptyRoot: 'Root not configured',
  emptyResults: 'No runs found',
  drawerEmpty: 'Select a run to inspect read-only details.',
  minimapLabel: 'Workflow mini-map provenance',
};
