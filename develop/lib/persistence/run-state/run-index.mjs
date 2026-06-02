import { constants } from 'node:fs';
import { access, open, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertManagedDirectory, assertManagedRunStateFile, createManagedDirectory, writeJsonAtomic } from './atomic-file.mjs';
import { assertRunsIndexSchema } from './schema/runs-index-schema.mjs';

export const RUNS_INDEX_SCHEMA_VERSION = 1;
export const RUNS_INDEX_TOPOLOGY_VERSION = 'workflow-runs-v1';
const RUNS_INDEX_LOCK_STALE_MS = 60_000;

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function assertIndexRunKey(run, key) {
  if (run.runId !== key) throw new Error(`runs index entry key mismatch for ${key}`);
}

function dropLegacyMetadataOnlyLeases(index) {
  if (!index?.runs || typeof index.runs !== 'object') return index;
  for (const run of Object.values(index.runs)) {
    const lease = run?.workerLease;
    if (lease && typeof lease === 'object' && (!lease.tokenHash || !lease.tokenEpoch)) run.workerLease = null;
  }
  return index;
}

export function assertRunsIndex(index) {
  dropLegacyMetadataOnlyLeases(index);
  assertRunsIndexSchema(index);
  for (const [key, run] of Object.entries(index.runs)) assertIndexRunKey(run, key);
  return index;
}

function pruneUndefinedProperties(value) {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
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

async function readLockMetadata(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return {}; }
}

function lockCreatedAt(metadata) {
  const createdAt = Date.parse(metadata?.createdAt);
  return Number.isFinite(createdAt) ? createdAt : Date.now();
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

async function readRunsIndexLockState(path, { now = Date.now(), staleMs = RUNS_INDEX_LOCK_STALE_MS } = {}) {
  const metadata = await readLockMetadata(path);
  const pastStaleAge = now - lockCreatedAt(metadata) >= staleMs;
  return { ownerAlive: isProcessAlive(metadata?.pid), pastStaleAge };
}

async function removeStaleRunsIndexLock(path, options = {}) {
  const state = await readRunsIndexLockState(path, options);
  if (state.ownerAlive || !state.pastStaleAge) return false;
  await rm(path, { force: true });
  return true;
}

export async function withRunsIndexLock(paths, callback) {
  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  await assertManagedRunStateFile(paths.runsIndexLockPath, 'workflow runs index lock');
  let handle;
  const deadline = Date.now() + 10_000;
  while (!handle) {
    try {
      handle = await open(paths.runsIndexLockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}
`, 'utf8');
      await handle.sync();
    } catch (error) {
      if (error?.code === 'EEXIST') {
        const lockState = await readRunsIndexLockState(paths.runsIndexLockPath);
        if (!lockState.ownerAlive && lockState.pastStaleAge && await removeStaleRunsIndexLock(paths.runsIndexLockPath)) continue;
        if (!(lockState.ownerAlive && lockState.pastStaleAge) && Date.now() < deadline) {
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

  try { return await callback(); }
  finally { await rm(paths.runsIndexLockPath, { force: true }); }
}

function assertWorkflowBinding(paths, patch = {}, existing) {
  const existingWorkflowPath = existing?.workflow?.path;
  const requestedWorkflowPath = patch.workflowPath ?? paths.workflowPath;
  if (typeof existingWorkflowPath === 'string' && existingWorkflowPath.length > 0 && resolve(existingWorkflowPath) !== resolve(requestedWorkflowPath)) {
    throw new Error(`workflow run is already bound to a different workflow: ${paths.runId}`);
  }
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
    workerLease: patch.workerLease ?? existing?.workerLease ?? null,
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
