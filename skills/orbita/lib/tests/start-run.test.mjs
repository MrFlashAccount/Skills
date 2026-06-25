import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-start-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/start-run.mjs');
const runsRoot = path.join(tempDir, '.workflow-runs');
const runPrefix = `start-${process.pid}-`;
function prefixedRunId(label) { return `${runPrefix}${label}`; }
function runPath(runId) { return path.join(runsRoot, runId); }

const fixtureWorkflowPath = path.join(tempDir, 'fixture.json');
const fixtureWorkflowDoc = {
    name: 'start-run-fixture',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { state: ['worker_step'], prompt: 'Run worker.' },
        output: { template: 'output.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};
writeFileSync(fixtureWorkflowPath, `${JSON.stringify(fixtureWorkflowDoc, null, 2)}
`);

function runStart(args, { token = `start-token-${process.pid}` } = {}) {
  const tokenArgs = token ? [`--lease-token=${token}`] : [];
  return spawnSync(process.execPath, [helperPath, '--workflow', fixtureWorkflowPath, ...args, ...tokenArgs], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: runsRoot, WORKFLOW_RUN_TOKEN: 'ignored-env-token' } });
}

function createClaimedRun(runId) {
  const result = spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', runId, '--workflow', fixtureWorkflowPath], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: runsRoot } });
  assert.equal(result.status, 0, `claim failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout).leaseToken;
}

function parseSuccess(label, result) {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function baton(overrides = {}) {
  return {
    cursor: 'done',
    status: 'done',
    state: { artifacts: [], results: [] },
    ...overrides,
  };
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  for (const label of ['new-run', 'start-run-user-prompt-rejected', 'resume-run', 'resume-no-history', 'invalid-baton-run', 'symlink-run-dir-rejected', 'missing-token']) {
    rmSync(runPath(prefixedRunId(label)), { recursive: true, force: true });
  }
});

test('start-run rejects symlinked derived run dir without writing outside the runs root', () => {
  const runId = prefixedRunId('symlink-run-dir-rejected');
  const runDir = runPath(runId);
  const outsideDir = path.join(tempDir, 'outside-symlink-run-dir');
  rmSync(runDir, { recursive: true, force: true });
  const token = createClaimedRun(runId);
  rmSync(runDir, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(outsideDir, runDir, 'dir');
  const result = runStart(['--run-id', runId], { token });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow run directory is unsafe because it is a symlink/);
  assert.equal(existsSync(path.join(outsideDir, 'baton.json')), false);
  assert.equal(existsSync(path.join(outsideDir, 'history.md')), false);
  assert.equal(existsSync(path.join(outsideDir, '.workflow-runner')), false);
});

test('start-run creates run dir, initializes baton/history, and returns steps', () => {
  const runId = prefixedRunId('new-run');
  const runDir = runPath(runId);
  rmSync(runDir, { recursive: true, force: true });
  const result = runStart(['--run-id', runId]);
  const status = parseSuccess('new run', result);

  assert.equal(status.ok, true);
  assert.equal(status.initialized, true);
  assert.equal(status.resumed, false);
  assert.equal(status.runId, runId);
  assert.equal('runDir' in status, false);
  assert.equal('baton' in status, false);
  assert.equal('history' in status, false);
  assert.equal(status.response.baton.cursor, 'worker_step');
  assert.equal(status.response.baton.status, 'running');
  assert.deepEqual(status.response.baton.state, { artifacts: [], results: [] });
  assert.equal(status.response.steps[0].id, 'worker_step');
  assert.equal(status.response.steps[0].action, 'run_worker');
  assert.deepEqual(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')), status.response.baton);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), '');
});



test('start-run rejects startup user prompt options; workflow-runner next owns rendering', () => {
  const runId = prefixedRunId('start-run-user-prompt-rejected');

  const inline = runStart(['--run-id', runId, '--user-prompt', 'raw prompt']);
  assert.notEqual(inline.status, 0);
  assert.match(inline.stderr, /Unknown option '--user-prompt'|usage: node skills\/orbita\/lib\/entrypoints\/cli\/start-run\.mjs --run-id <id>/);

  const file = runStart(['--run-id', runId, '--user-prompt-file', '']);
  assert.notEqual(file.status, 0);
  assert.match(file.stderr, /Unknown option '--user-prompt-file'|usage: node skills\/orbita\/lib\/entrypoints\/cli\/start-run\.mjs --run-id <id>/);
});

test('start-run resumes existing baton without overwriting it', () => {
  const runId = prefixedRunId('resume-run');
  const runDir = runPath(runId);
  rmSync(runDir, { recursive: true, force: true });
  const original = baton();
  writeJson(path.join(runDir, 'baton.json'), original);
  writeFileSync(path.join(runDir, 'history.md'), 'existing history\n');
  const beforeBaton = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const beforeHistory = readFileSync(path.join(runDir, 'history.md'), 'utf8');

  const token = createClaimedRun(runId);
  const result = runStart(['--run-id', runId], { token });
  const status = parseSuccess('resume run', result);

  assert.equal(status.initialized, false);
  assert.equal(status.resumed, true);
  assert.equal(status.response.baton.cursor, 'done');
  assert.equal(status.response.steps[0].action, 'stop_done');
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), beforeBaton);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), beforeHistory);
});

test('start-run creates missing history when resuming an existing baton', () => {
  const runId = prefixedRunId('resume-no-history');
  const runDir = runPath(runId);
  rmSync(runDir, { recursive: true, force: true });
  writeJson(path.join(runDir, 'baton.json'), baton());

  const token = createClaimedRun(runId);
  const result = runStart(['--run-id', runId], { token });
  const status = parseSuccess('resume no history', result);

  assert.equal(status.resumed, true);
  assert.equal(existsSync(path.join(runDir, 'history.md')), true);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), '');
});

test('start-run rejects invalid existing baton without overwriting it', () => {
  const runId = prefixedRunId('invalid-baton-run');
  const runDir = runPath(runId);
  rmSync(runDir, { recursive: true, force: true });
  const invalid = '{\n  "cursor": "research"\n}\n';
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(runDir, 'baton.json'), invalid);

  const token = createClaimedRun(runId);
  const result = runStart(['--run-id', runId], { token });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /baton failed schema validation|must have required property/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), invalid);
});

test('start-run rejects missing token without creating run state', () => {
  const runId = prefixedRunId('missing-token');
  const runDir = runPath(runId);
  rmSync(runDir, { recursive: true, force: true });

  const result = runStart(['--run-id', runId], { token: '' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow run token is required/);
  assert.equal(existsSync(runDir), false);
});

test('start-run requires concrete run id', () => {
  const result = runStart([]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--run-id is required/);
});
