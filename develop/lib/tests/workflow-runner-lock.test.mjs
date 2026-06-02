import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
import { buildTokenLease } from '../persistence/run-state/lease-authority.mjs';
import { createLockMetadata, removeStaleLock } from '../persistence/run-state/lock-metadata.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot } from '../persistence/run-state/run-index.mjs';
import { withRunStateLock } from '../persistence/run-state/lock.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-lock-'));
const runsRoot = path.join(tempDir, '.workflow-runs');

after(() => rmSync(tempDir, { recursive: true, force: true }));

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function workflowDoc() {
  return {
    name: 'runner-lock-check',
    version: 1,
    start: 'prepare',
    done: 'done',
    blocked: 'blocked',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { template: 'missing-input-template.md', prompt: 'This render would fail without the lock.' },
        output: { template: 'output.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };
}

test('runner: API next acquires run-state lock before loading and rendering current state', async () => {
  const runId = `lock-${process.pid}-api-next-lock-before-render`;
  const workflowPath = path.join(tempDir, 'api-next-lock-before-render-workflow.json');
  const runDir = resolveRunPaths({ runId, workflowPath, runsRoot }).runDir;
  rmSync(runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(path.join(runDir, '.workflow-runner'), { recursive: true });
  writeFileSync(path.join(runDir, '.workflow-runner', 'continue.lock'), `${JSON.stringify({ lockId: 'held', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, runsRoot, leaseToken: `held-run-lock-token-${process.pid}` }),
    /workflow-runner continue is already in progress/,
  );
  assert.equal(existsSync(path.join(runDir, 'baton.json')), false);
});

test('runner: API next recovers stale run-state lock left by killed process', async () => {
  const runId = `lock-${process.pid}-api-next-stale-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-stale-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, runsRoot, leaseToken: `stale-run-lock-token-${process.pid}` }),
    /workflow prompt render failed|missing-input-template/,
  );
  assert.equal(existsSync(paths.continueLockPath), false);
});

test('runner: API next recovers missed-heartbeat run-state lock even when owner pid is alive', async () => {
  const runId = `lock-${process.pid}-api-next-live-missed-heartbeat-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-live-missed-heartbeat-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'missed-heartbeat', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, runsRoot, leaseToken: `missed-heartbeat-run-lock-token-${process.pid}` }),
    /workflow prompt render failed|missing-input-template/,
  );
  assert.equal(existsSync(paths.continueLockPath), false);
});

test('runner: API next render failure does not overwrite existing index lifecycle status', async () => {
  const runId = `lock-${process.pid}-api-next-render-failure-preserves-index-status`;
  const workflowPath = path.join(tempDir, 'api-next-render-failure-preserves-index-status-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  const leaseToken = `render-failure-preserves-index-status-${process.pid}`;
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  await createRunIndexEntry(paths, {
    status: 'done',
    workflowPath,
    workerLease: buildTokenLease({ token: leaseToken, now: new Date('2026-06-01T10:00:00.000Z') }),
  });

  await assert.rejects(
    runnerNext({ runId, workflowPath, runsRoot, leaseToken, now: new Date('2026-06-01T10:00:01.000Z') }),
    /workflow prompt render failed|missing-input-template/,
  );

  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  assert.equal(index.runs[runId].status, 'done');
  assert.equal(existsSync(path.join(paths.runnerDir, 'last-response.json')), false);
});


test('runner: API next render failure marks newly indexed run failed and clears lease', async () => {
  const runId = `lock-${process.pid}-api-next-new-run-render-failure-clears-lease`;
  const workflowPath = path.join(tempDir, 'api-next-new-run-render-failure-clears-lease-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  const leaseToken = `new-run-render-failure-clears-lease-${process.pid}`;
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());

  await assert.rejects(
    runnerNext({ runId, workflowPath, runsRoot, leaseToken, now: new Date('2026-06-01T10:00:01.000Z') }),
    /workflow prompt render failed|missing-input-template/,
  );

  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  assert.equal(index.runs[runId].status, 'failed');
  assert.equal(index.runs[runId].workerLease, null);
});

test('runner: API next keeps fresh-heartbeat run-state lock held by live owner', async () => {
  const runId = `lock-${process.pid}-api-next-fresh-heartbeat-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-fresh-heartbeat-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'fresh-heartbeat', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, runsRoot, leaseToken: `fresh-heartbeat-run-lock-token-${process.pid}` }),
    /workflow-runner continue is already in progress/,
  );
  assert.equal(existsSync(paths.continueLockPath), true);
});

test('run-state stale cleanup does not delete a fresh replacement observed before stale rename', async () => {
  const runId = `lock-${process.pid}-cleanup-preserves-pre-rename-replacement`;
  const workflowPath = path.join(tempDir, 'cleanup-preserves-pre-rename-replacement-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'stale-before-replacement', pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);
  const replacement = createLockMetadata();

  const removed = await removeStaleLock(paths.continueLockPath, {
    beforeRename: async () => {
      rmSync(paths.continueLockPath, { force: true });
      writeFileSync(paths.continueLockPath, `${JSON.stringify(replacement)}\n`);
    },
  });

  assert.equal(removed, false);
  assert.equal(JSON.parse(readFileSync(paths.continueLockPath, 'utf8')).lockId, replacement.lockId);
  rmSync(paths.continueLockPath, { force: true });
});

test('run-state stale cleanup renames stale lock to tombstone and allows a new lock', async () => {
  const runId = `lock-${process.pid}-cleanup-rename-then-new-lock`;
  const workflowPath = path.join(tempDir, 'cleanup-rename-then-new-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  mkdirSync(paths.runnerDir, { recursive: true });
  const stale = { lockId: 'stale-rename-target', pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' };
  let observedTombstonePath;
  writeFileSync(paths.continueLockPath, `${JSON.stringify(stale)}\n`);

  const removed = await removeStaleLock(paths.continueLockPath, {
    afterRename: async (tombstonePath) => {
      observedTombstonePath = tombstonePath;
      assert.equal(existsSync(paths.continueLockPath), false);
      assert.equal(JSON.parse(readFileSync(tombstonePath, 'utf8')).lockId, stale.lockId);
      assert.match(tombstonePath, /stale-rename-target/);
    },
  });

  assert.equal(removed, true);
  assert.equal(existsSync(paths.continueLockPath), false);
  assert.equal(existsSync(observedTombstonePath), false);

  let replacementLockId;
  await withRunStateLock(paths, async () => {
    replacementLockId = JSON.parse(readFileSync(paths.continueLockPath, 'utf8')).lockId;
  });
  assert.notEqual(replacementLockId, stale.lockId);
  assert.equal(existsSync(paths.continueLockPath), false);
});

test('run-state stale cleanup aborts safely when stale rename fails', async () => {
  const runId = `lock-${process.pid}-cleanup-rename-fails`;
  const workflowPath = path.join(tempDir, 'cleanup-rename-fails-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'stale-rename-fails', pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  const removed = await removeStaleLock(paths.continueLockPath, {
    beforeRename: async () => {
      rmSync(paths.continueLockPath, { force: true });
    },
  });

  assert.equal(removed, false);
  assert.equal(existsSync(paths.continueLockPath), false);
});


test('run-state lock cleanup does not remove a replacement lock file', async () => {
  const runId = `lock-${process.pid}-cleanup-preserves-replacement`;
  const workflowPath = path.join(tempDir, 'cleanup-preserves-replacement-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });

  const replacement = createLockMetadata();
  await withRunStateLock(paths, async () => {
    rmSync(paths.continueLockPath, { force: true });
    writeFileSync(paths.continueLockPath, `${JSON.stringify(replacement)}\n`);
  });

  assert.equal(existsSync(paths.continueLockPath), true);
  rmSync(paths.continueLockPath, { force: true });
});
