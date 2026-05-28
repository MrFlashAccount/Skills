import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-persist-'));
const helperPath = path.join(root, 'develop/scripts/persist-run-state.mjs');

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
          input: { state: ['artifacts', 'results'], prompt: 'Approve research.' },
          next: { by: 'approval', map: { approved: 'architecture', blocked: 'blocked' } },
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
});

test('persist helper atomically replaces baton and appends readable history', () => {
  const runDir = path.join(tempDir, 'success-run');
  const responsePath = writeJson(path.join(tempDir, 'response.json'), response({ baton: { cursor: 'architecture' } }));
  const outputPath = path.join(runDir, 'outputs/research.json');

  const result = runPersist([
    '--run-dir', runDir,
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

test('persist helper appends history entries across calls', () => {
  const runDir = path.join(tempDir, 'append-run');
  const first = writeJson(path.join(tempDir, 'first-baton.json'), baton({ cursor: 'architecture' }));
  const second = writeJson(path.join(tempDir, 'second-baton.json'), baton({ cursor: 'implementation' }));

  assert.equal(runPersist(['--run-dir', runDir, '--baton', first, '--decision', 'first']).status, 0);
  assert.equal(runPersist(['--run-dir', runDir, '--baton', second, '--decision', 'second']).status, 0);

  const persisted = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.equal(persisted.cursor, 'implementation');
  assert.equal(history.match(/^## /gm).length, 2);
  assert.match(history, /decision: first/);
  assert.match(history, /decision: second/);
});

test('persist helper does not mutate old baton when response is unreadable', () => {
  const runDir = path.join(tempDir, 'unreadable-run');
  const oldBaton = baton({ cursor: 'research' });
  writeJson(path.join(runDir, 'baton.json'), oldBaton);
  const before = readFileSync(path.join(runDir, 'baton.json'), 'utf8');

  const result = runPersist(['--run-dir', runDir, '--response', path.join(tempDir, 'missing-response.json')]);

  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), before);
  assert.equal(existsSync(path.join(runDir, 'history.md')), false);
});

test('persist helper does not mutate old baton when response fails schema validation', () => {
  const runDir = path.join(tempDir, 'invalid-run');
  const oldBaton = baton({ cursor: 'research' });
  writeJson(path.join(runDir, 'baton.json'), oldBaton);
  const before = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const invalidResponse = writeJson(path.join(tempDir, 'invalid-response.json'), { baton: { cursor: 'missing-state' } });

  const result = runPersist(['--run-dir', runDir, '--response', invalidResponse]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema validation|must have required property/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), before);
  assert.equal(existsSync(path.join(runDir, 'history.md')), false);
});
