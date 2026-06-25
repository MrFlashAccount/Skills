import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { createLockMetadata, refreshLockHeartbeat, startLockHeartbeat } from '../persistence/run-state/lock-metadata.mjs';
import { runsIndexPathsForRoot, withRunsIndexLock } from '../persistence/run-state/run-index.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-run-index-lock-'));

after(() => rmSync(tempDir, { recursive: true, force: true }));

function indexPathsFor(label) {
  const runsRoot = path.join(tempDir, label);
  mkdirSync(runsRoot, { recursive: true });
  return runsIndexPathsForRoot(runsRoot);
}

test('runs index lock: missed-heartbeat lock is stale even while its owner process is alive', async () => {
  const paths = indexPathsFor('live-missed-heartbeat-index-lock');
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify({ lockId: 'missed-heartbeat', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: '1970-01-01T00:00:00.000Z' })}\n`);

  const result = await withRunsIndexLock(paths, async () => 'entered');

  assert.equal(result, 'entered');
  assert.equal(existsSync(paths.runsIndexLockPath), false);
});

test('runs index lock: fresh-heartbeat lock is not stale while its owner process is alive', async () => {
  const paths = indexPathsFor('fresh-heartbeat-index-lock');
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify({ lockId: 'fresh-heartbeat', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    withRunsIndexLock(paths, async () => 'entered', { waitMs: 50 }),
    /workflow runs index is locked/,
  );
  assert.equal(existsSync(paths.runsIndexLockPath), true);
});

test('runs index lock: old lock from dead process is recovered', async () => {
  const paths = indexPathsFor('dead-old-index-lock');
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify({ pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  const result = await withRunsIndexLock(paths, async () => 'entered');

  assert.equal(result, 'entered');
  assert.equal(existsSync(paths.runsIndexLockPath), false);
});

test('runs index lock: live legacy lock without heartbeat is not stale solely by age', async () => {
  const paths = indexPathsFor('live-legacy-index-lock');
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify({ pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    withRunsIndexLock(paths, async () => 'entered', { waitMs: 50 }),
    /workflow runs index is locked/,
  );
  assert.equal(existsSync(paths.runsIndexLockPath), true);
  rmSync(paths.runsIndexLockPath, { force: true });
});

test('runs index lock metadata heartbeat refreshes deterministically and removes on stop', async () => {
  const paths = indexPathsFor('heartbeat-refreshes-index-lock');
  const metadata = createLockMetadata({ now: new Date('1970-01-01T00:00:00.000Z') });
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify(metadata)}\n`);

  assert.equal(await refreshLockHeartbeat(paths.runsIndexLockPath, metadata), true);
  const refreshed = JSON.parse(readFileSync(paths.runsIndexLockPath, 'utf8'));
  const stopHeartbeat = startLockHeartbeat(paths.runsIndexLockPath, metadata, { heartbeatMs: 10_000 });
  await stopHeartbeat();

  assert.equal(refreshed.lockId, metadata.lockId);
  assert.notEqual(refreshed.heartbeatAt, '1970-01-01T00:00:00.000Z');
  assert.equal(existsSync(paths.runsIndexLockPath), false);
});

test('runs index lock: cleanup does not remove a replacement lock file', async () => {
  const paths = indexPathsFor('cleanup-preserves-replacement');
  const replacement = createLockMetadata();

  await withRunsIndexLock(paths, async () => {
    rmSync(paths.runsIndexLockPath, { force: true });
    writeFileSync(paths.runsIndexLockPath, `${JSON.stringify(replacement)}\n`);
  });

  assert.equal(existsSync(paths.runsIndexLockPath), true);
  rmSync(paths.runsIndexLockPath, { force: true });
});
