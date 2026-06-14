import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { assertSafeRunId, defaultWorkflowPath, resolveRunPaths, workflowRunsRoot } from './paths.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot, updateRunIndexEntry } from './run-index.mjs';
import { assertMatchingTokenAuthority, buildTokenLease, generateLeaseToken, occupancyForLease, renewTokenLease } from './lease-authority.mjs';
import { withRunStateLock } from './lock.mjs';

function publicRun(entry, { now = new Date() } = {}) {
  const workflow = {
    identity: entry.workflow?.identity,
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
    requestId: entry.requestId,
    currentStep: entry.currentStep,
    currentGate: entry.currentGate,
    taskFlowId: entry.taskFlowId,
    failure: entry.failure === undefined ? undefined : structuredClone(entry.failure),
  };
  for (const key of Object.keys(result)) if (result[key] === undefined) delete result[key];
  return result;
}

function sortByUpdatedAtDesc(left, right) {
  return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')) || left.runId.localeCompare(right.runId);
}

function normalizePositiveInteger(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 ? numeric : undefined;
}

function normalizedWorkflowPath(value) {
  return typeof value === 'string' && value.length > 0 ? resolve(value) : undefined;
}

function matchesWorkflowScope(entry, { workflowIdentity, workflowPath } = {}) {
  if (workflowIdentity && entry.workflow?.identity !== workflowIdentity) return false;
  const scopedPath = normalizedWorkflowPath(workflowPath);
  if (scopedPath && normalizedWorkflowPath(entry.workflow?.path) !== scopedPath) return false;
  return true;
}

export async function listWorkflowRunsAtRoot({ runsRoot = workflowRunsRoot, now = new Date(), workflowIdentity, workflowPath, limit, maxLimit } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
  const requestedLimit = normalizePositiveInteger(limit);
  const requestedMaxLimit = normalizePositiveInteger(maxLimit);
  const effectiveLimit = requestedLimit && requestedMaxLimit ? Math.min(requestedLimit, requestedMaxLimit) : (requestedLimit ?? requestedMaxLimit);
  const runs = Object.values(index.runs)
    .filter((entry) => matchesWorkflowScope(entry, { workflowIdentity, workflowPath }))
    .map((entry) => publicRun(entry, { now }))
    .sort(sortByUpdatedAtDesc);
  return effectiveLimit ? runs.slice(0, effectiveLimit) : runs;
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

function workflowPathForCreate(workflowPath) {
  return workflowPath === undefined ? defaultWorkflowPath : resolve(workflowPath);
}

function assertExistingWorkflowBinding(existing, paths, { requestedWorkflowPath } = {}) {
  const existingWorkflowPath = existing?.workflow?.path;
  if (requestedWorkflowPath === undefined || typeof existingWorkflowPath !== 'string' || existingWorkflowPath.length === 0) return;
  if (resolve(existingWorkflowPath) !== resolve(requestedWorkflowPath)) {
    throw new Error(`workflow run is already bound to a different workflow: ${paths.runId}`);
  }
}

export async function registerWorkflowRunAtRoot({ runId, title, summary, workflowPath, workflowIdentity, status = 'running', taskKey, taskFingerprint, requestId, currentStep, currentGate, taskFlowId, runsRoot = workflowRunsRoot, claim = false, owner, harness, sessionId, workerId, leaseMs, now = new Date() } = {}) {
  const safeRunId = runId === undefined ? generatedRunId() : assertSafeRunId(runId);
  const paths = resolveRunPaths({ runId: safeRunId, workflowPath: workflowPathForCreate(workflowPath), runsRoot });
  const leaseToken = claim ? generateLeaseToken() : undefined;
  const workerLease = claim ? buildTokenLease({ token: leaseToken, leaseMs, now }) : null;
  return withRunStateLock(paths, async () => {
    const entry = await createRunIndexEntry(paths, {
      title,
      summary,
      workflowPath: paths.workflowPath,
      workflowIdentity,
      status,
      taskKey,
      taskFingerprint,
      requestId,
      currentStep,
      currentGate,
      taskFlowId,
      workerLease,
    });
    const response = publicRun(entry, { now });
    if (leaseToken) response.leaseToken = leaseToken;
    return response;
  });
}

export async function claimWorkflowRunAtRoot({ runId, workflowPath, runsRoot = workflowRunsRoot, owner, harness, sessionId, workerId, leaseMs, leaseToken, takeover = false, now = new Date() } = {}) {
  const safeRunId = assertSafeRunId(runId);
  const paths = resolveRunPaths({ runId: safeRunId, workflowPath: workflowPathForCreate(workflowPath), runsRoot });
  const issuedLeaseToken = leaseToken || generateLeaseToken();
  try {
    return await withRunStateLock(paths, async () => {
      let tokenWasIssued = false;
      const entry = await updateRunIndexEntry(paths, (existing) => {
        assertExistingWorkflowBinding(existing, paths, { requestedWorkflowPath: workflowPath });
        const occupancy = occupancyForLease(existing.workerLease, now);
        if (leaseToken) {
          try { assertMatchingTokenAuthority(existing.workerLease, leaseToken, { runId: safeRunId }); }
          catch (error) {
            const conflict = new Error(error.message);
            conflict.code = 'WORKFLOW_RUN_OCCUPIED';
            conflict.run = publicRun(existing, { now });
            throw conflict;
          }
          return {
            ...existing,
            updatedAt: now.toISOString(),
            workerLease: renewTokenLease(existing.workerLease, { leaseMs, now }),
          };
        }
        if (occupancy.state === 'occupied') {
          const conflict = new Error(`workflow run is occupied: ${safeRunId}`);
          conflict.code = 'WORKFLOW_RUN_OCCUPIED';
          conflict.run = publicRun(existing, { now });
          throw conflict;
        }
        if (occupancy.state === 'stale' && !takeover) {
          const stale = new Error(`workflow run lease is stale: ${safeRunId}`);
          stale.code = 'WORKFLOW_RUN_STALE';
          stale.run = publicRun(existing, { now });
          throw stale;
        }
        tokenWasIssued = true;
        return {
          ...existing,
          updatedAt: now.toISOString(),
          workerLease: buildTokenLease({ token: issuedLeaseToken, leaseMs, now }),
        };
      });
      const response = { ok: true, claimed: true, runId: safeRunId, run: publicRun(entry, { now }) };
      if (tokenWasIssued) response.leaseToken = issuedLeaseToken;
      return response;
    });
  } catch (error) {
    if (error?.code === 'WORKFLOW_RUN_OCCUPIED') {
      return { ok: false, claimed: false, reason: 'occupied', runId: safeRunId, run: error.run };
    }
    if (error?.code === 'WORKFLOW_RUN_STALE') {
      return { ok: false, claimed: false, reason: 'stale', runId: safeRunId, run: error.run };
    }
    throw error;
  }
}

export async function heartbeatWorkflowRunAtRoot({ leaseToken, ...options } = {}) {
  if (!leaseToken) throw new Error('workflow run token is required');
  return claimWorkflowRunAtRoot({ ...options, leaseToken });
}
