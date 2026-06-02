import { AsyncLocalStorage } from 'node:async_hooks';
import { open, readFile, rm } from 'node:fs/promises';
import { createManagedDirectory } from './atomic-file.mjs';

const runStateLockStorage = new AsyncLocalStorage();
const RUN_STATE_LOCK_STALE_MS = 60_000;

function staleLockMessage(runId) {
  return `workflow-runner continue is already in progress for runId ${runId}`;
}

async function lockCreatedAt(path) {
  try {
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    const createdAt = Date.parse(metadata?.createdAt);
    return Number.isFinite(createdAt) ? createdAt : 0;
  } catch {
    return Date.now();
  }
}

async function removeStaleRunStateLock(path, { now = Date.now(), staleMs = RUN_STATE_LOCK_STALE_MS } = {}) {
  const createdAt = await lockCreatedAt(path);
  if (now - createdAt < staleMs) return false;
  await rm(path, { force: true });
  return true;
}

async function acquireRunStateLock(paths) {
  let handle;
  let acquired = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(paths.continueLockPath, 'wx', 0o600);
      acquired = true;
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, 'utf8');
      await handle.sync();
      return handle;
    } catch (error) {
      if (handle) await handle.close();
      if (error?.code === 'EEXIST' && attempt === 0 && await removeStaleRunStateLock(paths.continueLockPath)) continue;
      if (acquired) await rm(paths.continueLockPath, { force: true });
      throw error?.code === 'EEXIST' ? new Error(staleLockMessage(paths.runId)) : error;
    }
  }
  throw new Error(staleLockMessage(paths.runId));
}

export async function withRunStateLock(paths, callback) {
  const heldLocks = runStateLockStorage.getStore();
  if (heldLocks?.has(paths.continueLockPath)) return callback();

  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  await createManagedDirectory(paths.runDir, 'workflow run directory');
  await createManagedDirectory(paths.runnerDir, 'workflow runner directory');
  const handle = await acquireRunStateLock(paths);
  await handle.close();

  const nextHeldLocks = new Set(heldLocks ?? []);
  nextHeldLocks.add(paths.continueLockPath);
  try {
    return await runStateLockStorage.run(nextHeldLocks, callback);
  } finally {
    await rm(paths.continueLockPath, { force: true });
  }
}

export const withContinueRunLock = withRunStateLock;
