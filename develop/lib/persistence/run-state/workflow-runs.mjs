import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { assertSafeRunId, defaultWorkflowPath, resolveRunPaths, workflowRunsRoot } from './paths.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot, updateRunIndexEntry } from './run-index.mjs';

const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const LEASE_IDENTITY_FIELDS = ['owner', 'harness', 'sessionId', 'workerId'];

function occupancyForLease(workerLease, now = new Date()) {
  if (!workerLease) return { state: 'unclaimed', claimed: false };
  const expiresAt = Date.parse(workerLease.leaseExpiresAt ?? '');
  const hasFreshExpiry = Number.isFinite(expiresAt) && expiresAt > now.getTime();
  return hasFreshExpiry
    ? { state: 'occupied', claimed: true, leaseExpiresAt: workerLease.leaseExpiresAt, owner: workerLease.owner, harness: workerLease.harness, sessionId: workerLease.sessionId, workerId: workerLease.workerId }
    : { state: 'stale', claimed: false, leaseExpiresAt: workerLease.leaseExpiresAt, owner: workerLease.owner, harness: workerLease.harness, sessionId: workerLease.sessionId, workerId: workerLease.workerId };
}

function publicRun(entry, { now = new Date() } = {}) {
  const workflow = {
    identity: entry.workflow?.identity,
    path: entry.workflow?.path,
  };
  for (const key of Object.keys(workflow)) if (workflow[key] === undefined) delete workflow[key];
  const result = {
    runId: entry.runId,
    title: entry.title,
    summary: entry.summary,
    workflow,
    status: entry.status,
    occupancy: occupancyForLease(entry.workerLease, now),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    taskKey: entry.taskKey,
    taskFingerprint: entry.taskFingerprint,
  };
  for (const key of Object.keys(result)) if (result[key] === undefined) delete result[key];
  return result;
}

function sortByUpdatedAtDesc(left, right) {
  return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')) || left.runId.localeCompare(right.runId);
}

export async function listWorkflowRunsAtRoot({ runsRoot = workflowRunsRoot, now = new Date() } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
  return Object.values(index.runs).map((entry) => publicRun(entry, { now })).sort(sortByUpdatedAtDesc);
}

export function summarizeWorkflowRuns(runs) {
  const counts = { occupied: 0, stale: 0, unclaimed: 0 };
  for (const run of runs) counts[run.occupancy?.state] = (counts[run.occupancy?.state] ?? 0) + 1;
  const lines = [`workflow runs: ${runs.length} total, ${counts.occupied} occupied, ${counts.stale} stale, ${counts.unclaimed} unclaimed`];
  for (const run of runs) {
    const label = run.title ? ` ${run.title}` : '';
    const expires = run.occupancy?.leaseExpiresAt ? ` until ${run.occupancy.leaseExpiresAt}` : '';
    lines.push(`- ${run.runId}: ${run.status}, ${run.occupancy?.state ?? 'unclaimed'}${expires}${label}`);
  }
  return lines.join('\n');
}

function generatedRunId() {
  return assertSafeRunId(`run-${randomUUID()}`);
}

function toLeaseMetadata({ owner, harness, sessionId, workerId } = {}) {
  const metadata = { owner, harness, sessionId, workerId };
  for (const key of Object.keys(metadata)) if (metadata[key] === undefined) delete metadata[key];
  return metadata;
}

function leaseIdentityKeys(metadata = {}) {
  return LEASE_IDENTITY_FIELDS.filter((key) => metadata[key] !== undefined);
}

function leaseIdentityMatches(existingLease, requestedMetadata) {
  const existingKeys = leaseIdentityKeys(existingLease);
  const requestedKeys = leaseIdentityKeys(requestedMetadata);
  if (existingKeys.length === 0 || requestedKeys.length === 0) return false;
  if (existingKeys.length !== requestedKeys.length) return false;
  if (!existingKeys.every((key) => requestedKeys.includes(key))) return false;
  return existingKeys.every((key) => existingLease?.[key] === requestedMetadata[key]);
}

function rejectPartialLeaseIdentity(existingLease, requestedMetadata) {
  const existingKeys = leaseIdentityKeys(existingLease);
  const requestedKeys = leaseIdentityKeys(requestedMetadata);
  if (existingKeys.length === 0 || requestedKeys.length === 0) return;
  const isSameShape = existingKeys.length === requestedKeys.length && existingKeys.every((key) => requestedKeys.includes(key));
  if (!isSameShape) throw new Error('partial worker lease identity is not authorized');
}

function freshLeaseConflict(existingLease, requestedMetadata, now) {
  if (occupancyForLease(existingLease, now).state !== 'occupied') return false;
  return !leaseIdentityMatches(existingLease, requestedMetadata);
}

function buildWorkerLease({ owner, harness, sessionId, workerId, leaseMs = DEFAULT_LEASE_MS, now = new Date() } = {}) {
  const ms = Number(leaseMs);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('leaseMs must be a positive number');
  return {
    ...toLeaseMetadata({ owner, harness, sessionId, workerId }),
    heartbeatAt: now.toISOString(),
    leaseExpiresAt: new Date(now.getTime() + ms).toISOString(),
  };
}

function workflowPathForCreate(workflowPath) {
  return workflowPath === undefined ? defaultWorkflowPath : resolve(workflowPath);
}

export async function registerWorkflowRunAtRoot({ runId, title, summary, workflowPath, workflowIdentity, status = 'running', taskKey, taskFingerprint, runsRoot = workflowRunsRoot, claim = false, owner, harness, sessionId, workerId, leaseMs, now = new Date() } = {}) {
  const safeRunId = runId === undefined ? generatedRunId() : assertSafeRunId(runId);
  const paths = resolveRunPaths({ runId: safeRunId, workflowPath: workflowPathForCreate(workflowPath), runsRoot });
  const entry = await createRunIndexEntry(paths, {
    title,
    summary,
    workflowPath: paths.workflowPath,
    workflowIdentity,
    status,
    taskKey,
    taskFingerprint,
    workerLease: claim ? buildWorkerLease({ owner, harness, sessionId, workerId, leaseMs, now }) : null,
  });
  return publicRun(entry, { now });
}

export async function claimWorkflowRunAtRoot({ runId, workflowPath, runsRoot = workflowRunsRoot, owner, harness, sessionId, workerId, leaseMs, now = new Date() } = {}) {
  const safeRunId = assertSafeRunId(runId);
  const paths = resolveRunPaths({ runId: safeRunId, workflowPath: workflowPathForCreate(workflowPath), runsRoot });
  const requestedMetadata = toLeaseMetadata({ owner, harness, sessionId, workerId });
  try {
    const entry = await updateRunIndexEntry(paths, (existing) => {
      rejectPartialLeaseIdentity(existing.workerLease, requestedMetadata);
      if (freshLeaseConflict(existing.workerLease, requestedMetadata, now)) {
        const conflict = new Error(`workflow run is occupied: ${safeRunId}`);
        conflict.code = 'WORKFLOW_RUN_OCCUPIED';
        conflict.run = publicRun(existing, { now });
        throw conflict;
      }
      return {
        ...existing,
        updatedAt: now.toISOString(),
        workerLease: buildWorkerLease({ owner, harness, sessionId, workerId, leaseMs, now }),
      };
    });
    return { ok: true, claimed: true, runId: safeRunId, run: publicRun(entry, { now }) };
  } catch (error) {
    if (error?.code === 'WORKFLOW_RUN_OCCUPIED') {
      return { ok: false, claimed: false, reason: 'occupied', runId: safeRunId, run: error.run };
    }
    throw error;
  }
}

export async function heartbeatWorkflowRunAtRoot(options = {}) {
  return claimWorkflowRunAtRoot(options);
}
