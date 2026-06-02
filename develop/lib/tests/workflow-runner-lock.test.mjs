import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
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
  writeFileSync(path.join(runDir, '.workflow-runner', 'continue.lock'), 'held');

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

test('runner: API next does not recover an old lock while its owner process is alive', async () => {
  const runId = `lock-${process.pid}-api-next-live-old-continue-lock`;
  const workflowPath = path.join(tempDir, 'api-next-live-old-continue-lock-workflow.json');
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  writeJson(workflowPath, workflowDoc());
  mkdirSync(paths.runnerDir, { recursive: true });
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z' })}\n`);

  await assert.rejects(
    runnerNext({ runId, workflowPath, leaseToken: `live-old-run-lock-token-${process.pid}` }),
    /workflow-runner continue is already in progress/,
  );
  assert.equal(existsSync(paths.continueLockPath), true);
});
