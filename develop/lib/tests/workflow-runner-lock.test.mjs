import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
import { createLockMetadata } from '../persistence/run-state/lock-metadata.mjs';
import { withRunStateLock } from '../persistence/run-state/lock.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-lock-'));

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
  const runDir = resolveRunPaths({ runId, workflowPath }).runDir;
  rmSync(runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(path.join(runDir, '.workflow-runner'), { recursive: true });
  writeFileSync(path.join(runDir, '.workflow-runner', 'continue.lock'), `${JSON.stringify({ lockId: 'held', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath }),
    /workflow-runner continue is already in progress/,
  );
  assert.equal(existsSync(path.join(runDir, 'baton.json')), false);
});

test('runner: API next recovers stale run-state lock left by killed process', async () => {
  const runId = `lock-${process.pid}-api-next-stale-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-stale-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, leaseToken: `stale-run-lock-token-${process.pid}` }),
    /workflow prompt render failed|missing-input-template/,
  );
  assert.equal(existsSync(paths.continueLockPath), false);
});

test('runner: API next recovers missed-heartbeat run-state lock even when owner pid is alive', async () => {
  const runId = `lock-${process.pid}-api-next-live-missed-heartbeat-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-live-missed-heartbeat-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'missed-heartbeat', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, leaseToken: `missed-heartbeat-run-lock-token-${process.pid}` }),
    /workflow prompt render failed|missing-input-template/,
  );
  assert.equal(existsSync(paths.continueLockPath), false);
});

test('runner: API next keeps fresh-heartbeat run-state lock held by live owner', async () => {
  const runId = `lock-${process.pid}-api-next-fresh-heartbeat-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-fresh-heartbeat-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'fresh-heartbeat', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, leaseToken: `fresh-heartbeat-run-lock-token-${process.pid}` }),
    /workflow-runner continue is already in progress/,
  );
  assert.equal(existsSync(paths.continueLockPath), true);
});

test('run-state lock cleanup does not remove a replacement lock file', async () => {
  const runId = `lock-${process.pid}-cleanup-preserves-replacement`;
  const workflowPath = path.join(tempDir, 'cleanup-preserves-replacement-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });

  const replacement = createLockMetadata();
  await withRunStateLock(paths, async () => {
    rmSync(paths.continueLockPath, { force: true });
    writeFileSync(paths.continueLockPath, `${JSON.stringify(replacement)}\n`);
  });

  assert.equal(existsSync(paths.continueLockPath), true);
  rmSync(paths.continueLockPath, { force: true });
});
