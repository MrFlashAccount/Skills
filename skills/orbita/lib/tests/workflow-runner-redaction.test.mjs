import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { publicErrorMessage } from '../public-error.mjs';
import { next } from '../entrypoints/workflow-runner-command.mjs';
import { resolveRunPaths, workflowRunsRoot } from '../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
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
  const privateRunFile = path.join(workflowRunsRoot, 'redact-me/.workflow-runner/durable-commit.json');
  const privateIndex = path.join(workflowRunsRoot, 'runs.json');

  const redacted = publicErrorMessage(`cannot read ${privateRunFile}; cannot lock ${privateIndex}`);

  assert.doesNotMatch(redacted, /\.workflow-runs\//);
  assert.doesNotMatch(redacted, /redact-me/);
  assert.match(redacted, /workflow run private state/);
  assert.match(redacted, /workflow runs index/);
});

test('public error redaction hides custom workflow-runner roots without .workflow-runs sentinel', () => {
  const runsRoot = path.join(tmpdir(), `private-workflow-runs-${process.pid}`);
  const privateRunFile = path.join(runsRoot, 'redact-me', '.workflow-runner', 'durable-commit.json');
  const privateIndex = path.join(runsRoot, 'runs.json');

  const redacted = publicErrorMessage(`cannot read ${privateRunFile}; cannot lock ${privateIndex}`, { runsRoot });

  assert.doesNotMatch(redacted, /private-workflow-runs/);
  assert.doesNotMatch(redacted, /redact-me/);
  assert.doesNotMatch(redacted, /durable-commit\.json/);
  assert.doesNotMatch(redacted, /runs\.json/);
  assert.match(redacted, /workflow run private state/);
  assert.match(redacted, /workflow runs index/);
});

test('public error redaction hides Windows-style workflow-runner paths', () => {
  const runsRoot = 'C:\\Users\\Sergey\\private-runs';
  const redacted = publicErrorMessage(
    `cannot read ${runsRoot}\\redact-me\\.workflow-runner\\durable-commit.json; cannot lock ${runsRoot}\\runs.json`,
    { runsRoot },
  );

  assert.doesNotMatch(redacted, /C:\\Users/);
  assert.doesNotMatch(redacted, /redact-me/);
  assert.doesNotMatch(redacted, /durable-commit\.json/);
  assert.doesNotMatch(redacted, /runs\.json/);
  assert.match(redacted, /workflow run private state/);
  assert.match(redacted, /workflow runs index/);
});


test('workflow runner API corrupt runs index errors do not expose raw private index pathnames', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workflow-redaction-index-'));
  tempRoots.push(tempDir);
  const runsRoot = path.join(tempDir, '.workflow-runs');
  await mkdir(runsRoot, { recursive: true });
  await writeFile(path.join(runsRoot, 'runs.json'), '{not json\n');
  const id = runId('corrupt-index');

  await assert.rejects(
    () => next({ runId: id, runsRoot, leaseToken: `redaction-index-token-${process.pid}` }),
    (error) => {
      assert.match(error.message, /cannot parse workflow runs index from workflow runs index/);
      assert.doesNotMatch(error.message, /\.workflow-runs/);
      assert.doesNotMatch(error.message, /runs\.json/);
      assert.doesNotMatch(error.message, new RegExp(tempDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
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


test('workflow runner CLI errors do not expose raw workflow pathnames', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workflow-redaction-cli-'));
  tempRoots.push(tempDir);
  const workflowPath = path.join(tempDir, 'missing-private-cli-workflow.json');
  const id = runId('missing-cli-workflow');

  const result = spawnSync(process.execPath, [
    'skills/orbita/lib/entrypoints/cli/workflow-runner.mjs',
    'next',
    '--run-id', id,
    '--workflow', workflowPath,
    '--lease-token', `redaction-cli-token-${process.pid}`,
  ], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /failed to read workflow JSON: ENOENT|cannot read workflow: ENOENT/);
  assert.doesNotMatch(result.stderr, /missing-private-cli-workflow\.json/);
  assert.doesNotMatch(result.stderr, new RegExp(tempDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
