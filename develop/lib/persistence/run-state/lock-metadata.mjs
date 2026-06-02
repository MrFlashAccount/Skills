import { randomUUID } from 'node:crypto';
import { link, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';

export const RUN_STATE_LOCK_HEARTBEAT_MS = 3_000;
export const RUN_STATE_LOCK_STALE_MS = 12_000;

export function createLockMetadata({ now = new Date() } = {}) {
  const timestamp = now.toISOString();
  return {
    lockId: randomUUID(),
    pid: process.pid,
    createdAt: timestamp,
    heartbeatAt: timestamp,
  };
}

export async function readLockMetadata(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch {
    try {
      const stats = await stat(path);
      return { invalidLockFileMtimeMs: stats.mtimeMs };
    } catch {
      return {};
    }
  }
}

function timestampMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

export function isStaleLockMetadata(metadata, { now = Date.now(), staleMs = RUN_STATE_LOCK_STALE_MS } = {}) {
  const alive = isProcessAlive(metadata?.pid);
  const heartbeatAt = timestampMs(metadata?.heartbeatAt);
  if (Number.isFinite(heartbeatAt)) return !alive || now - heartbeatAt >= staleMs;
  if (alive) return false;
  const createdAt = timestampMs(metadata?.createdAt);
  if (Number.isFinite(createdAt)) return now - createdAt >= staleMs;
  const invalidMtime = Number(metadata?.invalidLockFileMtimeMs);
  return Number.isFinite(invalidMtime) && now - invalidMtime >= staleMs;
}

function sameLock(left, right) {
  if (typeof left?.lockId === 'string' && left.lockId.length > 0) return left.lockId === right?.lockId;
  if (Number.isFinite(Number(left?.invalidLockFileMtimeMs))) return Number(left.invalidLockFileMtimeMs) === Number(right?.invalidLockFileMtimeMs);
  return left?.pid === right?.pid && left?.createdAt === right?.createdAt && left?.heartbeatAt === right?.heartbeatAt;
}

function safeTombstoneIdentity(metadata) {
  const lockId = typeof metadata?.lockId === 'string' && metadata.lockId.length > 0
    ? metadata.lockId
    : `invalid-${Number.isFinite(Number(metadata?.invalidLockFileMtimeMs)) ? Number(metadata.invalidLockFileMtimeMs) : 'unknown'}`;
  return lockId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function renameIfExists(fromPath, toPath) {
  try {
    await rename(fromPath, toPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function restoreTombstoneIfPublicPathIsFree(tombstonePath, publicPath) {
  try {
    await link(tombstonePath, publicPath);
    await rm(tombstonePath, { force: true });
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function removeStaleLock(path, options = {}) {
  const first = await readLockMetadata(path);
  if (!isStaleLockMetadata(first, options)) return false;
  const second = await readLockMetadata(path);
  if (!sameLock(first, second) || !isStaleLockMetadata(second, options)) return false;

  const tombstonePath = `${path}.${safeTombstoneIdentity(second)}.${Date.now()}.${process.pid}.${randomUUID()}.stale`;
  await options.beforeRename?.();

  // Atomically remove the public lock path by moving the stale instance into a
  // private tombstone.  After this point cleanup may only delete tombstonePath;
  // never unlink the original path based on stale metadata observed earlier.
  if (!await renameIfExists(path, tombstonePath)) return false;

  const tombstone = await readLockMetadata(tombstonePath);
  if (!sameLock(second, tombstone) || !isStaleLockMetadata(tombstone, options)) {
    // The path changed between verification and rename. Put the moved lock back
    // only when the public path is still free; never overwrite a fresh lock and
    // never delete this tombstone because it may be the fresh replacement.
    await restoreTombstoneIfPublicPathIsFree(tombstonePath, path);
    return false;
  }
  await options.afterRename?.(tombstonePath);
  await rm(tombstonePath, { force: true });
  return true;
}


async function writeLockMetadata(path, metadata, shouldWrite = () => true) {
  const tempPath = `${path}.${metadata.lockId}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
    const current = await readLockMetadata(path);
    if (shouldWrite() && sameLock(metadata, current)) await rename(tempPath, path);
  } finally {
    await rm(tempPath, { force: true });
  }
}

export async function refreshLockHeartbeat(path, metadata, shouldWrite = () => true) {
  const current = await readLockMetadata(path);
  if (!sameLock(metadata, current)) return false;
  metadata.heartbeatAt = new Date().toISOString();
  await writeLockMetadata(path, metadata, shouldWrite);
  return true;
}

export function startLockHeartbeat(path, metadata, { heartbeatMs = RUN_STATE_LOCK_HEARTBEAT_MS } = {}) {
  let stopped = false;
  const beat = async () => {
    if (stopped) return;
    if (!await refreshLockHeartbeat(path, metadata, () => !stopped)) stopped = true;
  };
  const timer = setInterval(() => { beat().catch(() => { stopped = true; }); }, heartbeatMs);
  timer.unref?.();
  return async function stopLockHeartbeat() {
    stopped = true;
    clearInterval(timer);
    const current = await readLockMetadata(path);
    if (sameLock(metadata, current)) await rm(path, { force: true });
  };
}
