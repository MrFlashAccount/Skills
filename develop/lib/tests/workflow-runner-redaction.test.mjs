import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { publicErrorMessage } from '../entrypoints/cli/public-error.mjs';
import { next } from '../entrypoints/api/workflowRunner.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempRoots = [];
const runIds = [];

function runId(label) {
  const id = `workflow-redaction-test-${process.pid}-${label}`;
  runIds.push(id);
  return id;
}

after(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
  for (const id of runIds) rmSync(resolveRunPaths({ runId: id }).runDir, { recursive: true, force: true });
});

test('public error redaction hides workflow-runner private storage paths', () => {
  const privateRunFile = path.join(root, 'develop/.workflow-runs/redact-me/.workflow-runner/last-response.json');
  const privateIndex = path.join(root, 'develop/.workflow-runs/runs.json');

  const redacted = publicErrorMessage(`cannot read ${privateRunFile}; cannot lock ${privateIndex}`);

  assert.doesNotMatch(redacted, /\.workflow-runs\//);
  assert.doesNotMatch(redacted, /redact-me/);
  assert.match(redacted, /workflow run private state/);
  assert.match(redacted, /workflow runs index/);
});

test('workflow runner API read errors do not expose raw workflow pathnames', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workflow-redaction-'));
  tempRoots.push(tempDir);
  const workflowPath = path.join(tempDir, 'missing-private-workflow.json');
  const id = runId('missing-workflow');

  await assert.rejects(
    () => next({ runId: id, workflowPath, leaseToken: `redaction-token-${process.pid}` }),
    (error) => {
      assert.match(error.message, /cannot read workflow: ENOENT|failed to read workflow JSON: ENOENT/);
      assert.doesNotMatch(error.message, /missing-private-workflow\.json/);
      assert.doesNotMatch(error.message, new RegExp(tempDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});
