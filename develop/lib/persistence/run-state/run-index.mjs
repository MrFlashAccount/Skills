import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assertManagedRunStateFile, writeJsonAtomic } from './atomic-file.mjs';

export const RUNS_INDEX_SCHEMA_VERSION = 1;
export const RUNS_INDEX_TOPOLOGY_VERSION = 'workflow-runs-v1';

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function assertOptionalString(value, name) {
  if (value !== undefined && typeof value !== 'string') throw new Error(`${name} must be a string when present`);
}

function assertIndexRun(run, key) {
  assertObject(run, `runs index entry ${key}`);
  if (run.runId !== key) throw new Error(`runs index entry key mismatch for ${key}`);
  assertOptionalString(run.summary, `runs index entry ${key}.summary`);
  assertOptionalString(run.title, `runs index entry ${key}.title`);
  assertObject(run.workflow, `runs index entry ${key}.workflow`);
  assertOptionalString(run.workflow.identity, `runs index entry ${key}.workflow.identity`);
  if (typeof run.workflow.path !== 'string' || run.workflow.path.length === 0) throw new Error(`runs index entry ${key}.workflow.path must be a non-empty string`);
  if (!['running', 'needs_host_actions', 'done', 'blocked'].includes(run.status)) throw new Error(`runs index entry ${key}.status is invalid`);
  if (typeof run.createdAt !== 'string' || run.createdAt.length === 0) throw new Error(`runs index entry ${key}.createdAt must be a non-empty string`);
  if (typeof run.updatedAt !== 'string' || run.updatedAt.length === 0) throw new Error(`runs index entry ${key}.updatedAt must be a non-empty string`);
  assertOptionalString(run.taskKey, `runs index entry ${key}.taskKey`);
  assertOptionalString(run.taskFingerprint, `runs index entry ${key}.taskFingerprint`);
  if (run.workerLease !== null) assertObject(run.workerLease, `runs index entry ${key}.workerLease`);
}

export function assertRunsIndex(index) {
  assertObject(index, 'runs index');
  if (index.schemaVersion !== RUNS_INDEX_SCHEMA_VERSION) throw new Error('runs index has unsupported schemaVersion');
  if (index.topologyVersion !== RUNS_INDEX_TOPOLOGY_VERSION) throw new Error('runs index has unsupported topologyVersion');
  assertObject(index.runs, 'runs index runs');
  for (const [key, run] of Object.entries(index.runs)) assertIndexRun(run, key);
  return index;
}

export async function readRunsIndex(paths) {
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

export async function withRunsIndexLock(paths, callback) {
  await mkdir(paths.runsRoot, { recursive: true });
  await assertManagedRunStateFile(paths.runsIndexLockPath, 'workflow runs index lock');
  let handle;
  const deadline = Date.now() + 2000;
  while (!handle) {
    try {
      handle = await open(paths.runsIndexLockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, 'utf8');
      await handle.sync();
    } catch (error) {
      if (error?.code === 'EEXIST' && Date.now() < deadline) {
        await sleep(25);
        continue;
      }
      throw error?.code === 'EEXIST'
        ? new Error(`workflow runs index is locked: ${paths.runsIndexLockPath}`)
        : error;
    } finally {
      if (handle) await handle.close();
    }
  }

  try { return await callback(); }
  finally { await rm(paths.runsIndexLockPath, { force: true }); }
}

export async function upsertRunIndexEntry(paths, patch = {}) {
  return withRunsIndexLock(paths, async () => {
    const index = await readRunsIndex(paths);
    const now = new Date().toISOString();
    const existing = index.runs[paths.runId];
    const entry = {
      runId: paths.runId,
      summary: existing?.summary,
      title: existing?.title,
      workflow: {
        identity: patch.workflowIdentity ?? existing?.workflow?.identity,
        path: patch.workflowPath ?? existing?.workflow?.path ?? paths.workflowPath,
      },
      status: patch.status ?? existing?.status ?? 'running',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      taskKey: patch.taskKey ?? existing?.taskKey,
      taskFingerprint: patch.taskFingerprint ?? existing?.taskFingerprint,
      workerLease: patch.workerLease ?? existing?.workerLease ?? null,
    };
    if (patch.summary !== undefined) entry.summary = patch.summary;
    if (patch.title !== undefined) entry.title = patch.title;
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
