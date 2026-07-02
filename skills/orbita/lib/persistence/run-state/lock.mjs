import { AsyncLocalStorage } from 'node:async_hooks';
import { open } from 'node:fs/promises';
import { createManagedDirectory } from './atomic-file.mjs';
import { createLockMetadata, isStaleLockMetadata, readLockMetadata, removeStaleLock, startLockHeartbeat } from './lock-metadata.mjs';

const runStateLockStorage = new AsyncLocalStorage();
export const RUN_STATE_LOCK_WAIT_TIMEOUT_MS = 1_000;
export const RUN_STATE_LOCK_WAIT_INTERVAL_MS = 25;

function lockContentionTimeoutMessage(runId, waitTimeoutMs) {
  return `workflow-runner run-state lock contention timed out for runId ${runId} after ${waitTimeoutMs}ms`;
}

function staleCleanupSafetyMessage(runId) {
  return `workflow-runner stale run-state lock could not be safely removed for runId ${runId}`;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireRunStateLock(paths, options = {}) {
  const waitTimeoutMs = options.waitTimeoutMs ?? RUN_STATE_LOCK_WAIT_TIMEOUT_MS;
  const waitIntervalMs = options.waitIntervalMs ?? RUN_STATE_LOCK_WAIT_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => Date.now());
  const deadline = now() + waitTimeoutMs;

  while (true) {
    let handle;
    const metadata = createLockMetadata();
    try {
      handle = await open(paths.continueLockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
      await handle.sync();
      return metadata;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;

      const existing = await readLockMetadata(paths.continueLockPath);
      if (isStaleLockMetadata(existing, { now: now() })) {
        if (await removeStaleLock(paths.continueLockPath, { now: now() })) continue;
        throw new Error(staleCleanupSafetyMessage(paths.runId));
      }

      const remainingMs = deadline - now();
      if (remainingMs <= 0) throw new Error(lockContentionTimeoutMessage(paths.runId, waitTimeoutMs));
      await sleep(Math.min(waitIntervalMs, remainingMs));
    } finally {
      if (handle) await handle.close();
    }
  }
}

export async function withRunStateLock(paths, callback, options = {}) {
  const heldLocks = runStateLockStorage.getStore();
  if (heldLocks?.has(paths.continueLockPath)) return callback();

  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  await createManagedDirectory(paths.runDir, 'workflow run directory');
  await createManagedDirectory(paths.runnerDir, 'workflow runner directory');
  const metadata = await acquireRunStateLock(paths, {
    waitTimeoutMs: options.lockWaitTimeoutMs,
    waitIntervalMs: options.lockWaitIntervalMs,
    sleep: options.lockWaitSleep,
    now: options.lockWaitNow,
  });
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
