import { AsyncLocalStorage } from 'node:async_hooks';
import { open } from 'node:fs/promises';
import { createManagedDirectory } from './atomic-file.mjs';
import { createLockMetadata, removeStaleLock, startLockHeartbeat } from './lock-metadata.mjs';

const runStateLockStorage = new AsyncLocalStorage();

function staleLockMessage(runId) {
  return `workflow-runner continue is already in progress for runId ${runId}`;
}

async function acquireRunStateLock(paths) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    const metadata = createLockMetadata();
    try {
      handle = await open(paths.continueLockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
      await handle.sync();
      return metadata;
    } catch (error) {
      if (error?.code === 'EEXIST' && attempt === 0 && await removeStaleLock(paths.continueLockPath)) continue;
      throw error?.code === 'EEXIST' ? new Error(staleLockMessage(paths.runId)) : error;
    } finally {
      if (handle) await handle.close();
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
  const metadata = await acquireRunStateLock(paths);
  const stopHeartbeat = startLockHeartbeat(paths.continueLockPath, metadata);

  const nextHeldLocks = new Set(heldLocks ?? []);
  nextHeldLocks.add(paths.continueLockPath);
  try {
    return await runStateLockStorage.run(nextHeldLocks, callback);
  } finally {
    await stopHeartbeat();
  }
}

export const withContinueRunLock = withRunStateLock;
