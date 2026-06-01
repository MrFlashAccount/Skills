import { AsyncLocalStorage } from 'node:async_hooks';
import { open, rm } from 'node:fs/promises';
import { createManagedDirectory } from './atomic-file.mjs';

const runStateLockStorage = new AsyncLocalStorage();

export async function withRunStateLock(paths, callback) {
  const heldLocks = runStateLockStorage.getStore();
  if (heldLocks?.has(paths.continueLockPath)) return callback();

  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  await createManagedDirectory(paths.runDir, 'workflow run directory');
  await createManagedDirectory(paths.runnerDir, 'workflow runner directory');
  let handle;
  let acquired = false;
  try {
    handle = await open(paths.continueLockPath, 'wx', 0o600);
    acquired = true;
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`workflow-runner continue is already in progress for runId ${paths.runId}`);
    }
    if (acquired) await rm(paths.continueLockPath, { force: true });
    throw error;
  } finally {
    if (handle) await handle.close();
  }

  const nextHeldLocks = new Set(heldLocks ?? []);
  nextHeldLocks.add(paths.continueLockPath);
  try {
    return await runStateLockStorage.run(nextHeldLocks, callback);
  } finally {
    await rm(paths.continueLockPath, { force: true });
  }
}

export const withContinueRunLock = withRunStateLock;
