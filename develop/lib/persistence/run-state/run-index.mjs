import { constants } from 'node:fs';
import { access, open, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertManagedDirectory, assertManagedRunStateFile, createManagedDirectory, writeJsonAtomic } from './atomic-file.mjs';
import { createLockMetadata, isStaleLockMetadata, readLockMetadata, removeStaleLock, startLockHeartbeat } from './lock-metadata.mjs';
import { assertRunsIndexSchema } from './schema/runs-index-schema.mjs';

export const RUNS_INDEX_SCHEMA_VERSION = 1;
export const RUNS_INDEX_TOPOLOGY_VERSION = 'workflow-runs-v1';
const RUNS_INDEX_LOCK_WAIT_MS = 30_000;

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function assertIndexRunKey(run, key) {
  if (run.runId !== key) throw new Error(`runs index entry key mismatch for ${key}`);
}

function normalizeWorkerLeases(index) {
  if (!index?.runs || typeof index.runs !== 'object') return index;
  for (const run of Object.values(index.runs)) {
    const lease = run?.workerLease;
    if (!lease || typeof lease !== 'object') continue;
    if (!lease.tokenHash || !lease.tokenEpoch) {
      run.workerLease = null;
      continue;
    }
    run.workerLease = {
      tokenHash: lease.tokenHash,
      tokenEpoch: lease.tokenEpoch,
      leaseExpiresAt: lease.leaseExpiresAt,
    };
  }
  return index;
}

function normalizeFailureMetadata(index) {
  if (!index?.runs || typeof index.runs !== 'object') return index;
  for (const run of Object.values(index.runs)) {
    if (Object.hasOwn(run, 'failure')) run.failure = sanitizedFailureMetadata(run.failure);
  }
  return index;
}

export function assertRunsIndex(index) {
  normalizeWorkerLeases(index);
  normalizeFailureMetadata(index);
  assertRunsIndexSchema(index);
  for (const [key, run] of Object.entries(index.runs)) assertIndexRunKey(run, key);
  return index;
}

const REDACTED_FAILURE_METADATA = '[redacted]';
const SAFE_FAILURE_METADATA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,255}$/;
const PROMPT_TRANSCRIPT_MARKER_PATTERN = /<{2,}\s*(?:begin|end)?[-_\s]*(?:prompt|transcript)[^>]*>{2,}|(?:prompt|transcript)/iu;
const TOKEN_LABEL_PATTERN = /\b(?:lease[-_\s]?token|token|access[-_\s]?token|refresh[-_\s]?token|api[-_\s]?key|secret)\b/iu;
const PREFIXED_TOKEN_PATTERN = /\b(?:sk|ghp|github_pat|xox[baprs]|ya29|glpat|oc_[A-Za-z0-9]*)[_-][A-Za-z0-9_=-]{12,}\b/iu;
const JWT_PATTERN = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/u;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_=]{40,}$/u;

function pruneUndefinedProperties(value) {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

function isUnsafeFailureMetadataValue(value) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return trimmed.includes('/')
    || trimmed.includes('\\')
    || PROMPT_TRANSCRIPT_MARKER_PATTERN.test(trimmed)
    || TOKEN_LABEL_PATTERN.test(trimmed)
    || PREFIXED_TOKEN_PATTERN.test(trimmed)
    || JWT_PATTERN.test(trimmed)
    || OPAQUE_TOKEN_PATTERN.test(trimmed)
    || !SAFE_FAILURE_METADATA_PATTERN.test(trimmed);
}

function sanitizeFailureMetadataValue(value, { required = false } = {}) {
  if (typeof value !== 'string') return required ? REDACTED_FAILURE_METADATA : undefined;
  const trimmed = value.trim();
  if (!trimmed) return required ? REDACTED_FAILURE_METADATA : undefined;
  return isUnsafeFailureMetadataValue(trimmed) ? REDACTED_FAILURE_METADATA : trimmed;
}

export async function readRunsIndex(paths) {
  await assertManagedDirectory(paths.runsRoot, 'workflow runs root');
  await assertManagedRunStateFile(paths.runsIndexPath, 'workflow runs index');
  if (!(await exists(paths.runsIndexPath))) {
    return { schemaVersion: RUNS_INDEX_SCHEMA_VERSION, topologyVersion: RUNS_INDEX_TOPOLOGY_VERSION, runs: {} };
  }
  let content;
  try { content = await readFile(paths.runsIndexPath, 'utf8'); }
  catch (error) { throw new Error(`cannot read workflow runs index from ${paths.runsIndexPath}: ${error.message}`); }
  try { return assertRunsIndex(JSON.parse(content)); }
  catch (error) { throw new Error(`cannot parse workflow runs index from ${paths.runsIndexPath}: ${error.message}`); }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRunsIndexLock(paths, callback, { waitMs = RUNS_INDEX_LOCK_WAIT_MS } = {}) {
  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  await assertManagedRunStateFile(paths.runsIndexLockPath, 'workflow runs index lock');
  let metadata;
  const deadline = Date.now() + waitMs;
  while (!metadata) {
    let handle;
    const candidate = createLockMetadata();
    try {
      handle = await open(paths.runsIndexLockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(candidate)}\n`, 'utf8');
      await handle.sync();
      metadata = candidate;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        if (await removeStaleLock(paths.runsIndexLockPath)) continue;
        if (!isStaleLockMetadata(await readLockMetadata(paths.runsIndexLockPath)) && Date.now() < deadline) {
          await sleep(25);
          continue;
        }
      }
      throw error?.code === 'EEXIST'
        ? new Error('workflow runs index is locked')
        : error;
    } finally {
      if (handle) await handle.close();
    }
  }

  const stopHeartbeat = startLockHeartbeat(paths.runsIndexLockPath, metadata);
  try { return await callback(); }
  finally { await stopHeartbeat(); }
}

function assertWorkflowBinding(paths, patch = {}, existing) {
  const existingWorkflowPath = existing?.workflow?.path;
  const requestedWorkflowPath = patch.workflowPath ?? paths.workflowPath;
  if (typeof existingWorkflowPath === 'string' && existingWorkflowPath.length > 0 && resolve(existingWorkflowPath) !== resolve(requestedWorkflowPath)) {
    throw new Error(`workflow run is already bound to a different workflow: ${paths.runId}`);
  }
}

function sanitizedFailureMetadata(failure) {
  if (!failure || typeof failure !== 'object' || Array.isArray(failure)) return undefined;
  return pruneUndefinedProperties({
    request_id: sanitizeFailureMetadataValue(failure.request_id, { required: true }),
    error_code: sanitizeFailureMetadataValue(failure.error_code, { required: true }),
    failure_code: sanitizeFailureMetadataValue(failure.failure_code, { required: true }),
    workflow_run_id: sanitizeFailureMetadataValue(failure.workflow_run_id),
    failed_step_id: sanitizeFailureMetadataValue(failure.failed_step_id),
    failed_session_key: sanitizeFailureMetadataValue(failure.failed_session_key),
    runtime_run_id: sanitizeFailureMetadataValue(failure.runtime_run_id),
  });
}

function indexEntryForPaths(paths, patch = {}, existing) {
  assertWorkflowBinding(paths, patch, existing);
  const now = new Date().toISOString();
  const entry = {
    runId: paths.runId,
    summary: existing?.summary,
    title: existing?.title,
    workflow: {
      identity: patch.workflowIdentity ?? existing?.workflow?.identity,
      path: existing?.workflow?.path ?? patch.workflowPath ?? paths.workflowPath,
    },
    status: patch.status ?? existing?.status ?? 'running',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    taskKey: patch.taskKey ?? existing?.taskKey,
    taskFingerprint: patch.taskFingerprint ?? existing?.taskFingerprint,
    failure: Object.hasOwn(patch, 'failure') ? sanitizedFailureMetadata(patch.failure) : existing?.failure,
    workerLease: Object.hasOwn(patch, 'workerLease') ? patch.workerLease : (existing?.workerLease ?? null),
  };
  pruneUndefinedProperties(entry.workflow);
  pruneUndefinedProperties(entry);
  if (patch.summary !== undefined) entry.summary = patch.summary;
  if (patch.title !== undefined) entry.title = patch.title;
  return entry;
}

export async function upsertRunIndexEntry(paths, patch = {}) {
  return withRunsIndexLock(paths, async () => {
    const index = await readRunsIndex(paths);
    const entry = indexEntryForPaths(paths, patch, index.runs[paths.runId]);
    index.runs[paths.runId] = entry;
    assertRunsIndex(index);
    await writeJsonAtomic(paths.runsIndexPath, index);
    return entry;
  });
}

export async function createRunIndexEntry(paths, patch = {}) {
  return withRunsIndexLock(paths, async () => {
    const index = await readRunsIndex(paths);
    if (index.runs[paths.runId]) throw new Error(`workflow run already exists: ${paths.runId}`);
    const entry = indexEntryForPaths(paths, patch);
    index.runs[paths.runId] = entry;
    assertRunsIndex(index);
    await writeJsonAtomic(paths.runsIndexPath, index);
    return entry;
  });
}

export async function updateRunIndexEntry(paths, updater) {
  return withRunsIndexLock(paths, async () => {
    const index = await readRunsIndex(paths);
    const existing = index.runs[paths.runId];
    if (!existing) throw new Error(`unknown workflow run: ${paths.runId}`);
    const entry = await updater(existing, index);
    index.runs[paths.runId] = entry;
    assertRunsIndex(index);
    await writeJsonAtomic(paths.runsIndexPath, index);
    return entry;
  });
}

export function runsIndexPathsForRoot(runsRoot) {
  return {
    runsRoot,
    runsIndexPath: join(runsRoot, 'runs.json'),
    runsIndexLockPath: join(runsRoot, '.runs.json.lock'),
  };
}
