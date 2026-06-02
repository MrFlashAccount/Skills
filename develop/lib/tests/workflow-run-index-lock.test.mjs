import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { runsIndexPathsForRoot, withRunsIndexLock } from '../persistence/run-state/run-index.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-run-index-lock-'));

after(() => rmSync(tempDir, { recursive: true, force: true }));

function indexPathsFor(label) {
  const runsRoot = path.join(tempDir, label);
  mkdirSync(runsRoot, { recursive: true });
  return runsIndexPathsForRoot(runsRoot);
}

test('runs index lock: old lock is not stale while its owner process is alive', async () => {
  const paths = indexPathsFor('live-old-index-lock');
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify({ pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    withRunsIndexLock(paths, async () => 'entered'),
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
