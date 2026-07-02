import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { next } from '../use-cases/WorkflowRunnerCommand.mjs';
import { assertSafeRunId, resolveRunPaths } from '../persistence/run-state/paths.mjs';
import { readRunsIndex, runsIndexPathsForRoot, upsertRunIndexEntry } from '../persistence/run-state/run-index.mjs';
import { assertRunsIndexSchema } from '../persistence/run-state/schema/runs-index-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflowPath = path.join(root, 'skills/orbita/lib/tests/fixtures/runid-single.workflow.json');
const testLeaseToken = `workflow-runid-runtime-test-token-${process.pid}`;
const defaultRunsRoot = mkdtempSync(path.join(tmpdir(), 'workflow-runid-runtime-root-'));

function runId(label) {
  return `test-${process.pid}-${Date.now()}-${label}`;
}

function cleanup(id) {
  rmSync(path.join(defaultRunsRoot, id), { recursive: true, force: true });
}

test('workflow runner derives private run directory from public runId and indexes run', async () => {
  const id = runId('positive');
  cleanup(id);
  try {
    const response = await next({ runId: id, workflowPath, userPrompt: 'sensitive raw prompt', leaseToken: testLeaseToken, runsRoot: defaultRunsRoot });
    assert.equal(response.runId, id);
    assert.equal('runDir' in response, false);
    assert.match(response.requests[0].loadInstructionsCommand, /--run-id/);
    assert.doesNotMatch(response.requests[0].loadInstructionsCommand, /--run-dir/);

    const paths = resolveRunPaths({ runId: id, workflowPath, runsRoot: defaultRunsRoot });
    assert.equal(existsSync(path.join(paths.runDir, 'baton.json')), true);
    assert.equal(existsSync(path.join(paths.runDir, 'history.md')), true);

    const index = JSON.parse(readFileSync(path.join(defaultRunsRoot, 'runs.json'), 'utf8'));
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
    const first = await next({ runId: id, workflowPath, leaseToken: testLeaseToken, runsRoot: defaultRunsRoot });
    const second = await next({ runId: id, workflowPath, leaseToken: testLeaseToken, runsRoot: defaultRunsRoot });
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
    const ok = spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', 'next', '--run-id', id, '--workflow', workflowPath, '--lease-token', testLeaseToken], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: defaultRunsRoot, WORKFLOW_RUN_TOKEN: 'ignored-env-token' } });
    assert.equal(ok.status, 0, ok.stderr);
    const response = JSON.parse(ok.stdout);
    assert.equal(response.runId, id);
    assert.equal('runDir' in response, false);

    const bad = spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', 'next', '--run-dir', path.join('/tmp', id), '--workflow', workflowPath], { cwd: root, encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /Unknown option '--run-dir'/);
  } finally {
    cleanup(id);
  }
});

test('installed plugin layout starts a catalog-created run from the skill cwd', () => {
  const pluginRoot = mkdtempSync(path.join(tmpdir(), 'workflow-installed-layout-'));
  const skillRoot = path.join(pluginRoot, 'skills/orbita');
  const workflowsRoot = path.join(pluginRoot, 'workflows/dev-harness');
  const runsRoot = path.join(pluginRoot, '.workflow-runs');
  const id = runId('installed-layout');

  try {
    cpSync(path.join(root, 'skills/orbita/lib'), path.join(skillRoot, 'lib'), { recursive: true });
    cpSync(path.join(root, 'shared'), path.join(pluginRoot, 'shared'), { recursive: true });
    mkdirSync(workflowsRoot, { recursive: true });
    writeFileSync(path.join(workflowsRoot, 'workflow.json'), `${JSON.stringify({
      name: 'dev-harness',
      description: 'Minimal installed-layout workflow fixture.',
      version: 1,
      start: 'prepare',
      done: 'done',
      blocked: 'blocked',
      steps: {
        prepare: {
          name: 'Prepare',
          kind: 'worker',
          input: {
            prompt: 'Prepare the installed-layout answer.',
          },
          output: {
            template: 'runid-output.md',
          },
          next: 'done',
        },
        done: {
          name: 'Done',
          kind: 'done',
          input: { prompt: 'Finished.' },
        },
        blocked: {
          name: 'Blocked',
          kind: 'blocked',
          input: { prompt: 'Blocked.' },
        },
      },
    }, null, 2)}\n`);
    writeFileSync(path.join(workflowsRoot, 'runid-output.md'), 'Return strict JSON.\n');

    const catalog = spawnSync(process.execPath, ['./lib/entrypoints/cli/workflow-catalog.mjs', 'list', '--json'], {
      cwd: skillRoot,
      encoding: 'utf8',
    });
    assert.equal(catalog.status, 0, catalog.stderr);
    const workflowPath = JSON.parse(catalog.stdout).workflows.find((workflow) => workflow.name === 'dev-harness')?.path;
    assert.equal(realpathSync(workflowPath), realpathSync(path.join(pluginRoot, 'workflows/dev-harness/workflow.json')));

    const create = spawnSync(process.execPath, [
      './lib/entrypoints/cli/workflow-runs.mjs',
      'create',
      '--run-id',
      id,
      '--workflow',
      workflowPath,
      '--workflow-identity',
      'dev-harness',
    ], { cwd: skillRoot, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: runsRoot } });
    assert.equal(create.status, 0, create.stderr);

    const claim = spawnSync(process.execPath, [
      './lib/entrypoints/cli/workflow-runs.mjs',
      'claim',
      '--run-id',
      id,
      '--print-lease-token',
    ], { cwd: skillRoot, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: runsRoot } });
    assert.equal(claim.status, 0, claim.stderr);
    const leaseToken = claim.stdout.trim();
    assert.match(leaseToken, /\S/);

    const nextResult = spawnSync(process.execPath, [
      './lib/entrypoints/cli/workflow-runner.mjs',
      'next',
      '--run-id',
      id,
      '--lease-token',
      leaseToken,
    ], { cwd: skillRoot, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: runsRoot } });
    assert.equal(nextResult.status, 0, nextResult.stderr);
    const response = JSON.parse(nextResult.stdout);
    assert.equal(response.status, 'needs_host_actions');
    assert.equal(response.runId, id);
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true });
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

function validRunsIndex(overrides = {}) {
  const id = 'schema-test-run';
  return {
    schemaVersion: 1,
    topologyVersion: 'workflow-runs-v1',
    runs: {
      [id]: {
        runId: id,
        workflow: { path: workflowPath },
        status: 'running',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        workerLease: null,
      },
    },
    ...overrides,
  };
}

async function assertRunsIndexSchemaFailure(mutator, pattern) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'workflow-runs-index-schema-'));
  const paths = runsIndexPathsForRoot(tempRoot);
  const index = validRunsIndex();
  mutator(index);
  mkdirSync(tempRoot, { recursive: true });
  writeFileSync(paths.runsIndexPath, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
  try {
    await assert.rejects(() => readRunsIndex(paths), pattern);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}


test('stale runs.json lock is recovered before index write', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'workflow-runs-index-stale-lock-'));
  const paths = resolveRunPaths({ runId: 'stale-index-lock-run', workflowPath, runsRoot: tempRoot });
  mkdirSync(tempRoot, { recursive: true });
  writeFileSync(paths.runsIndexLockPath, `${JSON.stringify({ pid: process.pid + 1_000_000, createdAt: '1970-01-01T00:00:00.000Z' })}\n`, { mode: 0o600 });
  try {
    const entry = await upsertRunIndexEntry(paths, { status: 'running', workflowPath });
    assert.equal(entry.runId, 'stale-index-lock-run');
    assert.equal(existsSync(paths.runsIndexLockPath), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runs.json index records fail through JSON Schema validation', async () => {
  await assertRunsIndexSchemaFailure((index) => { index.extra = true; }, /runs index failed schema validation: .*must NOT have additional properties/);
  await assertRunsIndexSchemaFailure((index) => { delete index.runs['schema-test-run'].workflow; }, /runs index failed schema validation: .*must have required property 'workflow'/);
  await assertRunsIndexSchemaFailure((index) => { index.runs['schema-test-run'].status = 'paused'; }, /runs index failed schema validation: .*status.*must be equal to one of the allowed values|runs index failed schema validation: .*must be equal to one of the allowed values/);
  await assertRunsIndexSchemaFailure((index) => { index.runs['schema-test-run'].workflow.runDir = '/tmp/private'; }, /runs index failed schema validation: .*workflow.*must NOT have additional properties|runs index failed schema validation: .*must NOT have additional properties/);
  await assertRunsIndexSchemaFailure((index) => { index.runs['schema-test-run'].workerLease = 'lease'; }, /runs index failed schema validation: .*workerLease.*must be object|runs index failed schema validation: .*must match exactly one schema in oneOf/);
  await assertRunsIndexSchemaFailure((index) => { index.runs['schema-test-run'].taskKey = 'raw prompt with spaces'; }, /runs index failed schema validation: .*taskKey.*must match pattern|runs index failed schema validation: .*must match pattern/);
});

test('runs.json index record key mismatch remains semantic validation', async () => {
  await assertRunsIndexSchemaFailure((index) => { index.runs['schema-test-run'].runId = 'schema-test-other-run'; }, /runs index entry key mismatch for schema-test-run/);
});

test('runs.json schema requires token authority fields for occupied leases', () => {
  const missingTokenHash = validRunsIndex();
  missingTokenHash.runs['schema-test-run'].workerLease = { tokenEpoch: 1, leaseExpiresAt: '2026-06-01T00:30:00.000Z' };
  assert.throws(() => assertRunsIndexSchema(missingTokenHash), /tokenHash|must have required property 'tokenHash'/);

  const missingTokenEpoch = validRunsIndex();
  missingTokenEpoch.runs['schema-test-run'].workerLease = { tokenHash: '0'.repeat(64), leaseExpiresAt: '2026-06-01T00:30:00.000Z' };
  assert.throws(() => assertRunsIndexSchema(missingTokenEpoch), /tokenEpoch|must have required property 'tokenEpoch'/);

  const durableMetadata = validRunsIndex();
  durableMetadata.runs['schema-test-run'].workerLease = { tokenHash: '0'.repeat(64), tokenEpoch: 1, leaseExpiresAt: '2026-06-01T00:30:00.000Z', owner: 'alice' };
  assert.throws(() => assertRunsIndexSchema(durableMetadata), /owner|must NOT have additional properties/);
});
