import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-start-'));
const helperPath = path.join(root, 'develop/lib/bin/start-run.mjs');

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
        output: { template: '../../shared/templates/implementation-plan-template.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};
writeFileSync(fixtureWorkflowPath, `${JSON.stringify(fixtureWorkflowDoc, null, 2)}
`);

function runStart(args) {
  return spawnSync(process.execPath, [helperPath, '--workflow', fixtureWorkflowPath, ...args], { cwd: root, encoding: 'utf8' });
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
});

test('start-run creates run dir, initializes baton/history, and returns steps', () => {
  const runDir = path.join(tempDir, 'new-run');
  const result = runStart(['--run-dir', runDir]);
  const status = parseSuccess('new run', result);

  assert.equal(status.ok, true);
  assert.equal(status.initialized, true);
  assert.equal(status.resumed, false);
  assert.equal(status.runDir, runDir);
  assert.equal(status.response.baton.cursor, 'worker_step');
  assert.equal(status.response.baton.status, 'running');
  assert.deepEqual(status.response.baton.state, { artifacts: [], results: [] });
  assert.equal(status.response.steps[0].id, 'worker_step');
  assert.equal(status.response.steps[0].action, 'run_worker');
  assert.deepEqual(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')), status.response.baton);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), '');
});



test('start-run rejects startup user prompt options; workflow-runner next owns rendering', () => {
  const runDir = path.join(tempDir, 'start-run-user-prompt-rejected');

  const inline = runStart(['--run-dir', runDir, '--user-prompt', 'raw prompt']);
  assert.notEqual(inline.status, 0);
  assert.match(inline.stderr, /Unknown option '--user-prompt'|usage: node scripts\/start-run\.mjs --run-dir <dir> \[--workflow <workflow\.json>\]/);

  const file = runStart(['--run-dir', runDir, '--user-prompt-file', '']);
  assert.notEqual(file.status, 0);
  assert.match(file.stderr, /Unknown option '--user-prompt-file'|usage: node scripts\/start-run\.mjs --run-dir <dir> \[--workflow <workflow\.json>\]/);
});

test('start-run resumes existing baton without overwriting it', () => {
  const runDir = path.join(tempDir, 'resume-run');
  rmSync(runDir, { recursive: true, force: true });
  const original = baton();
  writeJson(path.join(runDir, 'baton.json'), original);
  writeFileSync(path.join(runDir, 'history.md'), 'existing history\n');
  const beforeBaton = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const beforeHistory = readFileSync(path.join(runDir, 'history.md'), 'utf8');

  const result = runStart(['--run-dir', runDir]);
  const status = parseSuccess('resume run', result);

  assert.equal(status.initialized, false);
  assert.equal(status.resumed, true);
  assert.equal(status.response.baton.cursor, 'done');
  assert.equal(status.response.steps[0].action, 'stop_done');
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), beforeBaton);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), beforeHistory);
});

test('start-run creates missing history when resuming an existing baton', () => {
  const runDir = path.join(tempDir, 'resume-no-history');
  rmSync(runDir, { recursive: true, force: true });
  writeJson(path.join(runDir, 'baton.json'), baton());

  const result = runStart(['--run-dir', runDir]);
  const status = parseSuccess('resume no history', result);

  assert.equal(status.resumed, true);
  assert.equal(existsSync(path.join(runDir, 'history.md')), true);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), '');
});

test('start-run rejects invalid existing baton without overwriting it', () => {
  const runDir = path.join(tempDir, 'invalid-baton-run');
  rmSync(runDir, { recursive: true, force: true });
  const invalid = '{\n  "cursor": "research"\n}\n';
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(runDir, 'baton.json'), invalid);

  const result = runStart(['--run-dir', runDir]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /baton failed schema validation|must have required property/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), invalid);
});

test('start-run requires concrete run dir', () => {
  const result = runStart([]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--run-dir is required/);
});
