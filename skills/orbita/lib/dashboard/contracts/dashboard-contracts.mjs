export const DASHBOARD_LANES = Object.freeze({
  WAITING_FOR_USER: 'waiting_for_user',
  WORKER_RUNNING: 'worker_running',
  BLOCKED: 'blocked',
  DEGRADED: 'degraded',
  DONE: 'done',
});

export const DASHBOARD_EVENT_TYPES = Object.freeze({
  SNAPSHOT: 'dashboard.snapshot',
  RUN_UPDATED: 'dashboard.run_updated',
  ERROR: 'dashboard.error',
});

export const HISTORY_EXCERPT_LIMITS = Object.freeze({
  bytes: 4096,
  lines: 40,
});

export const DASHBOARD_ALLOWED_RUN_FIELDS = Object.freeze([
  'runId',
  'title',
  'summary',
  'workflow',
  'status',
  'lane',
  'occupancy',
  'createdAt',
  'updatedAt',
  'cursor',
  'artifacts',
  'results',
  'historyExcerpt',
  'miniMap',
  'degraded',
]);
