import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';

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
  const runDir = path.join(tempDir, 'api-next-lock-before-render');
  const workflowPath = path.join(tempDir, 'api-next-lock-before-render-workflow.json');
  writeJson(workflowPath, workflowDoc());
  mkdirSync(path.join(runDir, '.workflow-runner'), { recursive: true });
  writeFileSync(path.join(runDir, '.workflow-runner', 'continue.lock'), 'held');

  await assert.rejects(
    runnerNext({ runDir, workflowPath }),
    /workflow-runner continue is already in progress/,
  );
  assert.equal(existsSync(path.join(runDir, 'baton.json')), false);
});
