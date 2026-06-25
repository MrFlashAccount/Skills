import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { assertPersistedRunState } from '../persistence/run-state/persisted-state-schema.mjs';
import { readPersistedRunState } from '../persistence/run-state/PersistedRunStateReader.mjs';
import { writeJsonAtomic } from '../persistence/run-state/atomic-file.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';
import { writePersistedRunStateUpdate } from '../persistence/run-state/PersistedRunStateWriter.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'persisted-run-state-'));

after(() => rmSync(tempDir, { recursive: true, force: true }));

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function baton(overrides = {}) {
  return {
    cursor: 'prepare',
    status: 'running',
    state: { artifacts: [], results: [] },
    ...overrides,
  };
}

function response(nextBaton = baton()) {
  return {
    status: 'needs_host_actions',
    orchestratorInstruction: 'Execute persisted-state test request.',
    baton: nextBaton,
    requests: [
      {
        id: 'prepare',
        action: 'run_worker',
        stepId: 'prepare',
        loadInstructionsCommand: 'cat runner/instructions/prepare.md',
      },
    ],
  };
}

function setupRunDir(name, initialBaton = baton()) {
  const runId = `persisted-state-test-${process.pid}-${name}`;
  const workflowPath = path.join(tempDir, `${name}-workflow.json`);
  writeJson(workflowPath, { name: name.replace(/_/g, '-'), version: 1, start: 'prepare', done: 'done', blocked: 'blocked', steps: { prepare: { name: 'Prepare', kind: 'worker', output: { template: 'output.md' }, next: 'done' }, done: { name: 'Done', kind: 'done' }, blocked: { name: 'Blocked', kind: 'blocked' } } });
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  mkdirSync(paths.runnerDir, { recursive: true });
  mkdirSync(paths.instructionsDir, { recursive: true });
  writeJson(paths.batonPath, initialBaton);
  writeFileSync(paths.historyPath, '');
  return paths;
}

test('persisted-state reader validates logical aggregate over split files', async () => {
  const paths = setupRunDir('valid_split');
  const persisted = await readPersistedRunState(paths);

  assert.equal(persisted.version, 1);
  assert.equal(persisted.storageTopology, 'split-files-v1');
  assert.equal(persisted.baton.cursor, 'prepare');
  assert.equal(persisted.history.mode, 'embedded-text');
});

test('persisted-state reader rejects invalid current durable baton', async () => {
  const paths = setupRunDir('invalid_current');
  writeJson(paths.batonPath, { cursor: 'prepare' });

  await assert.rejects(() => readPersistedRunState(paths), /baton failed schema validation/);
});

test('persisted-state writer rejects invalid next state before durable commit side effects', async () => {
  const paths = setupRunDir('invalid_next');
  await assert.rejects(
    () => writePersistedRunStateUpdate(paths, {
      baton: { cursor: 'prepare' },
      history: { source: 'test', baton: { cursor: 'prepare' } },
    }),
    /next persisted run state|baton failed schema validation/,
  );

  assert.equal(existsSync(paths.durableCommitPath), false);
  assert.equal(readFileSync(paths.historyPath, 'utf8'), '');
});



test('persisted-state writer acquires run-state lock before writing', async () => {
  const paths = setupRunDir('writer_lock');
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'held', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    () => writePersistedRunStateUpdate(paths, {
      baton: baton({ cursor: 'done', status: 'done' }),
      history: { source: 'test', baton: baton({ cursor: 'done', status: 'done' }) },
    }),
    (error) => {
      assert.match(error.message, /continue is already in progress for runId/);
      assert.match(error.message, new RegExp(paths.runId));
      assert.equal(error.message.includes(paths.runDir), false);
      assert.equal(error.message.includes(paths.continueLockPath), false);
      return true;
    },
  );

  assert.equal(existsSync(paths.durableCommitPath), false);
  assert.equal(readFileSync(paths.historyPath, 'utf8'), '');
  rmSync(paths.continueLockPath, { force: true });
});

test('persisted-state writer recovers existing pending journal before writing a new commit', async () => {
  const paths = setupRunDir('recover_existing_pending_before_write');
  const recoveredBaton = baton({ cursor: 'done', status: 'done' });
  writeJson(paths.durableCommitPath, {
    version: 1,
    id: 'pending-before-writer',
    createdAt: new Date().toISOString(),
    status: 'pending',
    baton: recoveredBaton,
    historyText: 'old pending history\n',
    sideEffects: { baton: true, history: true },
  });

  await writePersistedRunStateUpdate(paths, {
    baton: baton({ cursor: 'blocked', status: 'blocked' }),
    history: { source: 'test-new-commit', baton: baton({ cursor: 'blocked', status: 'blocked' }) },
  });

  const history = readFileSync(paths.historyPath, 'utf8');
  assert.match(history, /old pending history/);
  assert.match(history, /source: test-new-commit/);
  assert.equal(existsSync(paths.durableCommitPath), false);
});

test('persisted-state commit schema rejects missing id', async () => {
  const paths = setupRunDir('missing_commit_id');
  writeJson(paths.durableCommitPath, {
    version: 1,
    createdAt: new Date().toISOString(),
    status: 'pending',
    sideEffects: { baton: false, history: false },
  });

  await assert.rejects(() => readPersistedRunState(paths), /persisted run-state commit id/);
});

test('persisted-state reader rejects unsupported version and topology metadata', async () => {
  const paths = setupRunDir('invalid_metadata');
  const persisted = await readPersistedRunState(paths);

  assert.throws(() => assertPersistedRunState({ ...persisted, version: 2 }), /unsupported version/);
  assert.throws(() => assertPersistedRunState({ ...persisted, storageTopology: 'old' }), /unsupported storage topology/);
});

test('persisted-state recovery restores targets after injected durable commit failure', async () => {
  const paths = setupRunDir('recover_after_failure');
  const beforeBaton = readFileSync(paths.batonPath, 'utf8');
  process.env.WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER = 'history';
  try {
    await assert.rejects(
      () => writePersistedRunStateUpdate(paths, {
        baton: baton({ cursor: 'done', status: 'done' }),
        history: { source: 'test', baton: baton({ cursor: 'done', status: 'done' }) },
      }),
      /injected durable commit failure after history/,
    );
  } finally {
    delete process.env.WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER;
  }

  assert.equal(readFileSync(paths.batonPath, 'utf8'), beforeBaton);
  assert.equal(readFileSync(paths.historyPath, 'utf8'), '');
});

test('persisted-state reader rejects symlinked split storage file', async () => {
  const paths = setupRunDir('symlink_split');
  rmSync(paths.historyPath, { force: true });
  const outside = path.join(tempDir, 'outside-history.md');
  writeFileSync(outside, 'outside');
  symlinkSync(outside, paths.historyPath, 'file');

  await assert.rejects(() => readPersistedRunState(paths), /workflow history is unsafe because it is a symlink/);
});

// Keep writeJsonAtomic imported so this test file also verifies the public atomic primitive remains loadable.
assert.equal(typeof writeJsonAtomic, 'function');
