import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { next } from '../entrypoints/api/workflowRunner.mjs';
import { assertSafeRunId, resolveRunPaths, workflowRunsRoot } from '../persistence/run-state/paths.mjs';
import { readRunsIndex, runsIndexPathsForRoot } from '../persistence/run-state/run-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowPath = path.join(root, 'develop/lib/tests/fixtures/runid-single.workflow.json');

function runId(label) {
  return `test-${process.pid}-${Date.now()}-${label}`;
}

function cleanup(id) {
  rmSync(path.join(workflowRunsRoot, id), { recursive: true, force: true });
}

test('workflow runner derives private run directory from public runId and indexes run', async () => {
  const id = runId('positive');
  cleanup(id);
  try {
    const response = await next({ runId: id, workflowPath, userPrompt: 'sensitive raw prompt' });
    assert.equal(response.runId, id);
    assert.equal('runDir' in response, false);
    assert.match(response.requests[0].loadInstructionsCommand, /--run-id/);
    assert.doesNotMatch(response.requests[0].loadInstructionsCommand, /--run-dir/);

    const paths = resolveRunPaths({ runId: id, workflowPath });
    assert.equal(existsSync(path.join(paths.runDir, 'baton.json')), true);
    assert.equal(existsSync(path.join(paths.runDir, 'history.md')), true);
    assert.equal(existsSync(path.join(paths.runDir, '.workflow-runner', 'last-response.json')), true);

    const index = JSON.parse(readFileSync(path.join(workflowRunsRoot, 'runs.json'), 'utf8'));
    assert.equal(index.runs[id].runId, id);
    assert.equal(index.runs[id].status, 'needs_host_actions');
    assert.equal(index.runs[id].workflow.path, workflowPath);
    assert.equal(JSON.stringify(index).includes('sensitive raw prompt'), false);
  } finally {
    cleanup(id);
  }
});

test('same runId resumes the same derived run directory', async () => {
  const id = runId('resume');
  cleanup(id);
  try {
    const first = await next({ runId: id, workflowPath });
    const second = await next({ runId: id, workflowPath });
    assert.equal(first.initialized, true);
    assert.equal(second.resumed, true);
    assert.deepEqual(second.baton, first.baton);
  } finally {
    cleanup(id);
  }
});

test('unsafe runId values fail before filesystem use', () => {
  for (const id of ['../escape', 'nested/path', 'nested\\path', '.', '..', '/abs', '~home', '$ENV', '']) {
    assert.throws(() => assertSafeRunId(id), /runId/);
  }
});

test('workflow-runner CLI exposes runId and rejects runDir', () => {
  const id = runId('cli');
  cleanup(id);
  try {
    const ok = spawnSync(process.execPath, ['develop/lib/entrypoints/cli/workflow-runner.mjs', 'next', '--run-id', id, '--workflow', workflowPath], { cwd: root, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    const response = JSON.parse(ok.stdout);
    assert.equal(response.runId, id);
    assert.equal('runDir' in response, false);

    const bad = spawnSync(process.execPath, ['develop/lib/entrypoints/cli/workflow-runner.mjs', 'next', '--run-dir', path.join('/tmp', id), '--workflow', workflowPath], { cwd: root, encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /Unknown option '--run-dir'/);
  } finally {
    cleanup(id);
  }
});

test('corrupt runs.json fails controlled', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'workflow-runs-index-corrupt-'));
  const paths = runsIndexPathsForRoot(tempRoot);
  mkdirSync(tempRoot, { recursive: true });
  writeFileSync(paths.runsIndexPath, '{not json', { mode: 0o600 });
  try {
    await assert.rejects(() => readRunsIndex(paths), /cannot parse workflow runs index/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
