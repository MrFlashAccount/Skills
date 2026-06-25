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
      response: response({ cursor: 'prepare' }),
      baton: { cursor: 'prepare' },
      instructions: [],
      history: { source: 'test', baton: { cursor: 'prepare' } },
    }),
    /next persisted run state|baton failed schema validation/,
  );

  assert.equal(existsSync(paths.durableCommitPath), false);
  assert.equal(readFileSync(paths.historyPath, 'utf8'), '');
});



test('persisted-state reader exposes committed instruction refs after journal removal', async () => {
  const paths = setupRunDir('committed_instruction_refs');
  await writePersistedRunStateUpdate(paths, {
    response: response(baton({ cursor: 'prepare', status: 'running' })),
    baton: baton({ cursor: 'prepare', status: 'running' }),
    instructions: [{ path: path.join(paths.instructionsDir, 'prepare.md'), content: '# Prepare instructions' }],
    history: { source: 'test', baton: baton({ cursor: 'prepare', status: 'running' }) },
  });

  assert.equal(existsSync(paths.durableCommitPath), false);
  const persisted = await readPersistedRunState(paths);
  assert.equal(persisted.instructions.length, 1);
  assert.equal(persisted.instructions[0].stepId, 'prepare');
  assert.match(persisted.instructions[0].content, /Prepare instructions/);
});

test('persisted-state reader rejects missing committed instruction file', async () => {
  const paths = setupRunDir('missing_committed_instruction');
  await writePersistedRunStateUpdate(paths, {
    response: response(baton({ cursor: 'prepare', status: 'running' })),
    baton: baton({ cursor: 'prepare', status: 'running' }),
    instructions: [{ path: path.join(paths.instructionsDir, 'prepare.md'), content: '# Prepare instructions' }],
    history: { source: 'test', baton: baton({ cursor: 'prepare', status: 'running' }) },
  });
  rmSync(path.join(paths.instructionsDir, 'prepare.md'), { force: true });

  await assert.rejects(() => readPersistedRunState(paths), /missing committed instruction file/);
});

test('persisted-state writer acquires run-state lock before writing', async () => {
  const paths = setupRunDir('writer_lock');
  writeFileSync(paths.continueLockPath, `${JSON.stringify({ lockId: 'held', pid: process.pid, createdAt: '1970-01-01T00:00:00.000Z', heartbeatAt: new Date().toISOString() })}\n`);

  await assert.rejects(
    () => writePersistedRunStateUpdate(paths, {
      response: response(baton({ cursor: 'done', status: 'done' })),
      baton: baton({ cursor: 'done', status: 'done' }),
      instructions: [],
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

test('persisted-state writer rejects escaping instruction paths before durable commit journal', async () => {
  const paths = setupRunDir('invalid_instruction_ref');
  const outsideInstruction = path.join(tempDir, 'outside-instruction.md');

  await assert.rejects(
    () => writePersistedRunStateUpdate(paths, {
      response: response(baton({ cursor: 'done', status: 'done' })),
      baton: baton({ cursor: 'done', status: 'done' }),
      instructions: [{ path: outsideInstruction, content: '# Escape' }],
      history: { source: 'test', baton: baton({ cursor: 'done', status: 'done' }) },
    }),
    /instruction path escapes instructions dir/,
  );

  assert.equal(existsSync(paths.durableCommitPath), false);
  assert.equal(existsSync(outsideInstruction), false);
  assert.equal(readFileSync(paths.historyPath, 'utf8'), '');
});


test('persisted-state reader rejects invalid current pending durable instruction refs', async () => {
  const paths = setupRunDir('invalid_current_pending_instruction_ref');
  writeJson(paths.durableCommitPath, {
    version: 1,
    id: 'pending-invalid-ref',
    createdAt: new Date().toISOString(),
    status: 'pending',
    instructions: [{ path: path.join(tempDir, 'escaped-current-ref.md'), content: '# Escape' }],
    sideEffects: { baton: false, lastResponse: false, history: false, instructions: 1 },
  });

  await assert.rejects(
    () => readPersistedRunState(paths),
    /pending durable workflow commit instruction path escapes instructions dir/,
  );
});

test('persisted-state writer recovers existing pending journal before writing a new commit', async () => {
  const paths = setupRunDir('recover_existing_pending_before_write');
  const recoveredBaton = baton({ cursor: 'done', status: 'done' });
  writeJson(paths.durableCommitPath, {
    version: 1,
    id: 'pending-before-writer',
    createdAt: new Date().toISOString(),
    status: 'pending',
    response: response(recoveredBaton),
    baton: recoveredBaton,
    instructions: [{ path: path.join(paths.instructionsDir, 'prepare.md'), content: '# Pending prepare' }],
    historyText: 'old pending history\n',
    sideEffects: { baton: true, lastResponse: true, history: true, instructions: 1 },
  });

  await writePersistedRunStateUpdate(paths, {
    response: response(baton({ cursor: 'blocked', status: 'blocked' })),
    baton: baton({ cursor: 'blocked', status: 'blocked' }),
    instructions: [],
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
    instructions: [],
    sideEffects: { baton: false, lastResponse: false, history: false, instructions: 0 },
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
        response: response(baton({ cursor: 'done', status: 'done' })),
        baton: baton({ cursor: 'done', status: 'done' }),
        instructions: [{ path: path.join(paths.instructionsDir, 'prepare.md'), content: '# Prepare' }],
        history: { source: 'test', baton: baton({ cursor: 'done', status: 'done' }) },
      }),
      /injected durable commit failure after history/,
    );
  } finally {
    delete process.env.WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER;
  }

  assert.equal(readFileSync(paths.batonPath, 'utf8'), beforeBaton);
  assert.equal(readFileSync(paths.historyPath, 'utf8'), '');
  assert.equal(existsSync(path.join(paths.instructionsDir, 'prepare.md')), false);
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

test('persisted-state reader quarantines legacy host response workflow path projection', async () => {
  const paths = setupRunDir('legacy_response_workflow_quarantine');
  const legacyWorkflowPath = path.join(tempDir, 'private-legacy-workflow.json');
  writeJson(paths.lastResponsePath, { ...response(), workflow: legacyWorkflowPath });
  writeFileSync(path.join(paths.instructionsDir, 'prepare.md'), '# Prepare instructions');

  const persisted = await readPersistedRunState(paths);

  assert.equal('workflow' in persisted.lastResponse, false);
  assert.doesNotMatch(JSON.stringify(persisted.lastResponse), /private-legacy-workflow/);
});

test('runner host response schema rejects public legacy workflow path projection', () => {
  assert.throws(
    () => assertPersistedRunState({
      version: 1,
      storageTopology: 'split-files-v1',
      run: { runDir: '/private/run', workflowPath: '/private/workflow.json', repositoryRoot: '/private' },
      baton: baton(),
      lastResponse: { ...response(), workflow: '/private/workflow.json' },
      instructions: [],
      history: { mode: 'embedded-text', path: '/private/history.md', text: '' },
    }),
    /must NOT have additional properties|additionalProperties/,
  );
});
