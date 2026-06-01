import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-persist-'));
const helperPath = path.join(root, 'develop/lib/entrypoints/cli/persist-run-state.mjs');
const runsRoot = path.join(root, 'develop/.workflow-runs');
const runPrefix = `persist-${process.pid}-`;
function runId(label) { return `${runPrefix}${label}`; }
function runPath(id) { return path.join(runsRoot, id); }

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function baton(overrides = {}) {
  return {
    cursor: 'approve_research',
    status: 'running',
    state: { artifacts: [{ type: 'research', summary: 'done' }], results: [] },
    ...overrides,
  };
}

function response(overrides = {}) {
  return {
    baton: baton(overrides.baton),
    steps: [
      {
        id: 'approve_research',
        action: 'wait_for_approval',
        step: {
          name: 'Approve research',
          kind: 'approval',
          input: { state: ['research_draft'], prompt: 'Approve research.' },
          next: { match: '${{ output.approval }}', cases: { approved: 'architecture', blocked: 'blocked' } },
        },
      },
    ],
  };
}

function runPersist(args) {
  return spawnSync(process.execPath, [helperPath, ...args], { cwd: root, encoding: 'utf8' });
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  for (const label of ['success-run', 'symlink-history-run', 'symlink-run-dir-rejected', 'append-run', 'unreadable-run', 'invalid-run']) rmSync(runPath(runId(label)), { recursive: true, force: true });
});

test('persist helper atomically replaces baton and appends readable history', () => {
  const id = runId('success-run');
  const runDir = runPath(id);
  const responsePath = writeJson(path.join(tempDir, 'response.json'), response({ baton: { cursor: 'architecture' } }));
  const outputPath = path.join(runDir, 'outputs/research.json');

  const result = runPersist([
    '--run-id', id,
    '--response', responsePath,
    '--output', outputPath,
    '--decision', 'research ready for approval',
  ]);

  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.deepEqual(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).cursor, 'architecture');

  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /baton: cursor=architecture status=running/);
  assert.match(history, /steps: id=approve_research action=wait_for_approval/);
  assert.match(history, /output: .*research\.json/);
  assert.match(history, /decision: research ready for approval/);

  const status = JSON.parse(result.stdout);
  assert.equal(status.ok, true);
  assert.equal(status.baton, path.join(runDir, 'baton.json'));
});

test('persist helper rejects symlinked derived run dir without writing outside the runs root', () => {
  const id = runId('symlink-run-dir-rejected');
  const runDir = runPath(id);
  const outsideDir = path.join(tempDir, 'outside-symlink-run-dir');
  rmSync(runDir, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(outsideDir, runDir, 'dir');
  const inputPath = writeJson(path.join(tempDir, 'symlink-run-dir-baton.json'), baton({ cursor: 'architecture' }));

  const result = runPersist(['--run-id', id, '--baton', inputPath, '--decision', 'must not escape']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow run directory is unsafe because it is a symlink/);
  assert.equal(existsSync(path.join(outsideDir, 'baton.json')), false);
  assert.equal(existsSync(path.join(outsideDir, 'history.md')), false);
  assert.equal(existsSync(path.join(outsideDir, '.workflow-runner')), false);
});

test('persist helper rejects symlinked history without appending outside run dir', () => {
  const id = runId('symlink-history-run');
  const runDir = runPath(id);
  mkdirSync(runDir, { recursive: true });
  const outsideHistory = path.join(tempDir, 'outside-history.md');
  writeFileSync(outsideHistory, 'outside must stay private\n');
  symlinkSync(outsideHistory, path.join(runDir, 'history.md'), 'file');
  const inputPath = writeJson(path.join(tempDir, 'symlink-history-baton.json'), baton({ cursor: 'architecture' }));

  const result = runPersist(['--run-id', id, '--baton', inputPath, '--decision', 'must not escape']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlinked run-state file|symlink/);
  assert.equal(readFileSync(outsideHistory, 'utf8'), 'outside must stay private\n');
});

test('persist helper rejects unsafe run id before writing', () => {
  const inputPath = writeJson(path.join(tempDir, 'unsafe-run-id-baton.json'), baton({ cursor: 'architecture' }));
  const result = runPersist(['--run-id', '../escape', '--baton', inputPath, '--decision', 'must not follow']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid workflow runId/);
});

test('persist helper appends history entries across calls', () => {
  const id = runId('append-run');
  const runDir = runPath(id);
  const first = writeJson(path.join(tempDir, 'first-baton.json'), baton({ cursor: 'architecture' }));
  const second = writeJson(path.join(tempDir, 'second-baton.json'), baton({ cursor: 'implementation' }));

  assert.equal(runPersist(['--run-id', id, '--baton', first, '--decision', 'first']).status, 0);
  assert.equal(runPersist(['--run-id', id, '--baton', second, '--decision', 'second']).status, 0);

  const persisted = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.equal(persisted.cursor, 'implementation');
  assert.equal(history.match(/^## /gm).length, 2);
  assert.match(history, /decision: first/);
  assert.match(history, /decision: second/);
});

test('persist helper does not mutate old baton when response is unreadable', () => {
  const id = runId('unreadable-run');
  const runDir = runPath(id);
  const oldBaton = baton({ cursor: 'research' });
  writeJson(path.join(runDir, 'baton.json'), oldBaton);
  const before = readFileSync(path.join(runDir, 'baton.json'), 'utf8');

  const result = runPersist(['--run-id', id, '--response', path.join(tempDir, 'missing-response.json')]);

  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), before);
  assert.equal(existsSync(path.join(runDir, 'history.md')), false);
});

test('persist helper does not mutate old baton when response fails schema validation', () => {
  const id = runId('invalid-run');
  const runDir = runPath(id);
  const oldBaton = baton({ cursor: 'research' });
  writeJson(path.join(runDir, 'baton.json'), oldBaton);
  const before = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const invalidResponse = writeJson(path.join(tempDir, 'invalid-response.json'), { baton: { cursor: 'missing-state' } });

  const result = runPersist(['--run-id', id, '--response', invalidResponse]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema validation|must have required property/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), before);
  assert.equal(existsSync(path.join(runDir, 'history.md')), false);
});
