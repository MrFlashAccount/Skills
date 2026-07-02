import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after, beforeEach } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listWorkflowRuns, summarizeWorkflowRuns } from '../entrypoints/api/workflowRuns.mjs';
import { publicErrorMessage } from '../entrypoints/cli/public-error.mjs';
import { claimWorkflowRunAtRoot, heartbeatWorkflowRunAtRoot, listWorkflowRunsAtRoot, registerWorkflowRunAtRoot } from '../persistence/run-state/workflow-runs.mjs';
import { buildTokenLease, formatLeaseTokenEntropy } from '../persistence/run-state/lease-authority.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot } from '../persistence/run-state/run-index.mjs';
import { resolveRunPaths, workflowRunsRoot } from '../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runs-api-'));
const runsRoot = path.join(tempDir, 'runs');
const cliRunsRoot = path.join(tempDir, 'cli-runs');
const runsIndexPath = path.join(runsRoot, 'runs.json');
const defaultWorkflow = path.join(root, 'workflows/dev-harness/workflow.json');
const runPrefix = `runs-api-${process.pid}-`;

function makeSymlinkedRunsRoot() {
  const symlinkCaseRoot = mkdtempSync(path.join(tempDir, 'symlinked-runs-root-'));
  const escapedTarget = path.join(symlinkCaseRoot, 'escaped-target');
  const symlinkedRunsRoot = path.join(symlinkCaseRoot, 'runs-link');
  mkdirSync(escapedTarget, { recursive: true });
  symlinkSync(escapedTarget, symlinkedRunsRoot, 'dir');
  return { escapedTarget, symlinkedRunsRoot };
}

async function assertSymlinkedRunsRootRejected(operation) {
  const { escapedTarget, symlinkedRunsRoot } = makeSymlinkedRunsRoot();
  await assert.rejects(
    () => operation(symlinkedRunsRoot),
    /workflow runs root is unsafe because it is a symlink/,
  );
  assert.equal(existsSync(path.join(escapedTarget, 'runs.json')), false);
  assert.equal(existsSync(path.join(escapedTarget, '.runs.json.lock')), false);
}

function resetIndex(content) {
  rmSync(runsRoot, { recursive: true, force: true });
  if (content !== undefined) {
    mkdirSync(runsRoot, { recursive: true });
    writeFileSync(runsIndexPath, content);
  }
}

function removeDefaultRunsForTestPrefix() {
  const runsIndexPath = path.join(cliRunsRoot, 'runs.json');
  if (!existsSync(runsIndexPath)) return;
  const index = JSON.parse(readFileSync(runsIndexPath, 'utf8'));
  let changed = false;
  for (const runId of Object.keys(index.runs ?? {})) {
    if (!runId.startsWith(runPrefix)) continue;
    delete index.runs[runId];
    rmSync(path.join(cliRunsRoot, runId), { recursive: true, force: true });
    changed = true;
  }
  if (changed) writeFileSync(runsIndexPath, `${JSON.stringify(index, null, 2)}\n`);
}

beforeEach(() => resetIndex(undefined));
after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  removeDefaultRunsForTestPrefix();
});

test('workflow runs API lists empty array when index is missing', async () => {
  assert.deepEqual(await listWorkflowRunsAtRoot({ runsRoot }), []);
});

test('workflow runs default root lives under ORBITA_HOME outside the skill tree', () => {
  const orbitaHome = path.join(tempDir, 'orbita-home');
  const env = { ...process.env, ORBITA_HOME: orbitaHome };
  delete env.WORKFLOW_RUNS_ROOT;

  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { repositoryRoot, workflowRunsRoot } from './skills/orbita/lib/persistence/run-state/paths.mjs'; console.log(JSON.stringify({ repositoryRoot, workflowRunsRoot }));",
  ], { cwd: root, encoding: 'utf8', env });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.workflowRunsRoot, path.join(orbitaHome, 'workflow-runs/v1'));
  assert.equal(payload.workflowRunsRoot.startsWith(path.join(payload.repositoryRoot, 'skills/orbita')), false);
});

test('direct node --test import isolates default workflow runs root and cleans it on exit', () => {
  const testFile = path.join(tempDir, 'direct-node-test-root.test.mjs');
  const markerFile = path.join(tempDir, 'direct-node-test-root.json');
  const pathsModuleUrl = pathToFileURL(path.join(root, 'skills/orbita/lib/persistence/run-state/paths.mjs')).href;
  writeFileSync(testFile, [
    "import test from 'node:test';",
    "import { writeFileSync } from 'node:fs';",
    `import { workflowRunsRoot } from ${JSON.stringify(pathsModuleUrl)};`,
    `test('isolated root', () => writeFileSync(${JSON.stringify(markerFile)}, JSON.stringify({ workflowRunsRoot, envRoot: process.env.WORKFLOW_RUNS_ROOT })));`,
  ].join('\n'));

  const env = { ...process.env };
  delete env.WORKFLOW_RUNS_ROOT;
  delete env.ORBITA_HOME;
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', testFile], { cwd: root, encoding: 'utf8', env });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(readFileSync(markerFile, 'utf8'));
  assert.equal(payload.workflowRunsRoot, payload.envRoot);
  assert.match(payload.workflowRunsRoot, /orbita-test-workflow-runs-/);
  assert.equal(payload.workflowRunsRoot.startsWith(path.join(process.env.HOME, '.orbita')), false);
  assert.equal(existsSync(payload.workflowRunsRoot), false);
});

test('workflow runs default root migrates legacy skill-local runs when target is empty', (t) => {
  const legacyRoot = path.join(root, 'skills/orbita/.workflow-runs');
  const orbitaHome = path.join(tempDir, 'orbita-home-migration');
  const migratedRoot = path.join(orbitaHome, 'workflow-runs/v1');
  const runId = `${runPrefix}legacy-migration`;
  if (existsSync(legacyRoot)) {
    t.skip('legacy workflow runs root already exists');
    return;
  }
  t.after(() => {
    rmSync(legacyRoot, { recursive: true, force: true });
    rmSync(orbitaHome, { recursive: true, force: true });
  });

  mkdirSync(legacyRoot, { recursive: true });
  writeFileSync(path.join(legacyRoot, 'runs.json'), `${JSON.stringify({
    schemaVersion: 1,
    topologyVersion: 'workflow-runs-v1',
    runs: {
      [runId]: {
        runId,
        workflow: { path: defaultWorkflow },
        status: 'running',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
        workerLease: null,
      },
    },
  }, null, 2)}\n`);

  const env = { ...process.env, ORBITA_HOME: orbitaHome };
  delete env.WORKFLOW_RUNS_ROOT;
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { listWorkflowRuns } from './skills/orbita/lib/entrypoints/api/workflowRuns.mjs'; console.log(JSON.stringify(await listWorkflowRuns()));",
  ], { cwd: root, encoding: 'utf8', env });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout)[0].runId, runId);
  assert.equal(existsSync(path.join(migratedRoot, 'runs.json')), true);
  assert.equal(existsSync(legacyRoot), false);
});

test('workflow runs default root blocks silent legacy migration when target is not empty', (t) => {
  const legacyRoot = path.join(root, 'skills/orbita/.workflow-runs');
  const orbitaHome = path.join(tempDir, 'orbita-home-migration-conflict');
  const migratedRoot = path.join(orbitaHome, 'workflow-runs/v1');
  if (existsSync(legacyRoot)) {
    t.skip('legacy workflow runs root already exists');
    return;
  }
  t.after(() => {
    rmSync(legacyRoot, { recursive: true, force: true });
    rmSync(orbitaHome, { recursive: true, force: true });
  });

  mkdirSync(legacyRoot, { recursive: true });
  mkdirSync(migratedRoot, { recursive: true });
  writeFileSync(path.join(legacyRoot, 'runs.json'), `${JSON.stringify({ schemaVersion: 1, topologyVersion: 'workflow-runs-v1', runs: {} }, null, 2)}\n`);
  writeFileSync(path.join(migratedRoot, 'runs.json'), `${JSON.stringify({ schemaVersion: 1, topologyVersion: 'workflow-runs-v1', runs: {} }, null, 2)}\n`);

  const env = { ...process.env, ORBITA_HOME: orbitaHome };
  delete env.WORKFLOW_RUNS_ROOT;
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { listWorkflowRuns } from './skills/orbita/lib/entrypoints/api/workflowRuns.mjs'; await listWorkflowRuns();",
  ], { cwd: root, encoding: 'utf8', env });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /legacy skill-local workflow runs exist/);
  assert.equal(existsSync(legacyRoot), true);
  assert.equal(existsSync(path.join(migratedRoot, 'runs.json')), true);
});

test('workflow runs API fails controlled when index JSON is invalid', async () => {
  resetIndex('{not-json');

  await assert.rejects(
    () => listWorkflowRunsAtRoot({ runsRoot }),
    /cannot parse workflow runs index/,
  );
});

test('workflow runs API creates accepted safe run id with public metadata only', async () => {
  const runId = `${runPrefix}safe`;
  const response = await registerWorkflowRunAtRoot({
    runsRoot,
    runId,
    workflowPath: defaultWorkflow,
    workflowIdentity: 'dev-harness',
    title: 'Human title',
    summary: 'Short summary',
    taskKey: 'task:key/1',
    taskFingerprint: 'fingerprint-1',
  });

  assert.equal(response.runId, runId);
  assert.equal(response.title, 'Human title');
  assert.equal(response.summary, 'Short summary');
  assert.deepEqual(response.workflow, { identity: 'dev-harness' });
  assert.equal(response.status, 'running');
  assert.equal(response.taskKey, 'task:key/1');
  assert.equal(response.taskFingerprint, 'fingerprint-1');
  assert.equal('workerLease' in response, false);
  assert.equal('runDir' in response, false);
  assert.equal('runsRoot' in response, false);

  const listed = await listWorkflowRunsAtRoot({ runsRoot });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].runId, runId);
  assert.equal('runDir' in listed[0], false);
  assert.equal('runsRoot' in listed[0], false);
});

test('workflow-runs create rejects relative workflow paths clearly', async () => {
  await assert.rejects(
    () => registerWorkflowRunAtRoot({
      runsRoot,
      runId: `${runPrefix}relative-workflow-api`,
      workflowPath: 'workflows/dev-harness/workflow.json',
    }),
    /workflow path must be absolute.*workflow-catalog.*absolute catalog path/,
  );

  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  const result = spawnSync(process.execPath, [
    helperPath,
    'create',
    '--run-id',
    `${runPrefix}relative-workflow-cli`,
    '--workflow',
    'workflows/dev-harness/workflow.json',
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /workflow-runs: workflow path must be absolute/);
  assert.match(result.stderr, /workflow-catalog/);
});

test('workflow-runs create accepts catalog absolute workflow path from a different cwd', () => {
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  const runId = `${runPrefix}catalog-absolute-cwd`;
  const result = spawnSync(process.execPath, [
    helperPath,
    'create',
    '--run-id',
    runId,
    '--workflow',
    defaultWorkflow,
    '--workflow-identity',
    'dev-harness',
  ], { cwd: tempDir, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.runId, runId);
  assert.deepEqual(response.workflow, { identity: 'dev-harness' });
});

test('workflow runs API generates a safe run id when omitted', async () => {
  const response = await registerWorkflowRunAtRoot({ runsRoot, title: 'Generated run' });

  assert.match(response.runId, /^run-[0-9a-f-]{36}$/);
  assert.equal(response.title, 'Generated run');
  assert.deepEqual(response.workflow, {});
});

test('workflow runs API rejects unsafe run id', async () => {
  await assert.rejects(
    () => registerWorkflowRunAtRoot({ runsRoot, runId: '../unsafe' }),
    /invalid workflow runId/,
  );
});

test('workflow runs API rejects duplicate run id instead of overwriting', async () => {
  const runId = `${runPrefix}duplicate`;
  await registerWorkflowRunAtRoot({ runsRoot, runId, title: 'First' });

  await assert.rejects(
    () => registerWorkflowRunAtRoot({ runsRoot, runId, title: 'Second' }),
    /workflow run already exists/,
  );
  const listed = await listWorkflowRunsAtRoot({ runsRoot });
  assert.equal(listed[0].title, 'First');
});

test('workflow runs API rejects occupied fresh lease owned by someone else', async () => {
  const runId = `${runPrefix}occupied`;
  const now = new Date('2026-06-01T10:00:00.000Z');
  await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'generic', sessionId: 'session-a', leaseMs: 60_000, now });

  const response = await claimWorkflowRunAtRoot({ runsRoot, runId, owner: 'bob', harness: 'generic', sessionId: 'session-b', now: new Date('2026-06-01T10:00:10.000Z') });

  assert.equal(response.ok, false);
  assert.equal(response.reason, 'occupied');
  assert.equal(response.run.occupancy.state, 'occupied');
  assert.equal('workerLease' in response.run, false);
});

test('workflow runs API requires explicit takeover for stale tokenless claims', async () => {
  const runId = `${runPrefix}stale`;
  await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'generic', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const stale = await claimWorkflowRunAtRoot({ runsRoot, runId, owner: 'bob', harness: 'portable', sessionId: 'session-b', leaseMs: 60_000, now: new Date('2026-06-01T10:00:02.000Z') });

  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale');
  assert.equal(stale.run.occupancy.state, 'stale');

  const response = await claimWorkflowRunAtRoot({ runsRoot, runId, owner: 'bob', harness: 'portable', sessionId: 'session-b', leaseMs: 60_000, takeover: true, now: new Date('2026-06-01T10:00:02.000Z') });

  assert.equal(response.ok, true);
  assert.equal(response.claimed, true);
  assert.equal(response.run.occupancy.state, 'occupied');
  assert.equal('workerLease' in response.run, false);
});

test('workflow runs API create-with-claim issues token but stores only hash authority', async () => {
  const runId = `${runPrefix}token-storage`;
  const response = await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });

  assert.equal(typeof response.leaseToken, 'string');
  assert.equal('workerLease' in response, false);
  const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
  const storedLease = index.runs[runId].workerLease;
  assert.deepEqual(Object.keys(storedLease).sort(), ['leaseExpiresAt', 'tokenEpoch', 'tokenHash']);
  assert.match(storedLease.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(storedLease.tokenEpoch, 1);
  assert.equal(storedLease.leaseExpiresAt, '2026-06-01T10:01:00.000Z');
  assert.equal(storedLease.tokenHash.includes(response.leaseToken), false);
  assert.equal(JSON.stringify(await listWorkflowRunsAtRoot({ runsRoot })).includes(response.leaseToken), false);
  assert.equal(JSON.stringify(await listWorkflowRunsAtRoot({ runsRoot })).includes(storedLease.tokenHash), false);
});

test('workflow runs lease token generation keeps dash-leading base64url entropy CLI-safe', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  const runId = `${runPrefix}dash-leading-token`;
  const dashLeadingEntropy = Buffer.concat([Buffer.from([0xf8]), Buffer.alloc(31)]);
  const rawToken = dashLeadingEntropy.toString('base64url');
  const leaseToken = formatLeaseTokenEntropy(dashLeadingEntropy);
  removeDefaultRunsForTestPrefix();

  assert.match(rawToken, /^-/);
  assert.doesNotMatch(leaseToken, /^-/);
  assert.equal(leaseToken.endsWith(rawToken), true);

  await createRunIndexEntry(
    resolveRunPaths({ runId, workflowPath: defaultWorkflow, runsRoot: cliRunsRoot }),
    { workerLease: buildTokenLease({ token: leaseToken, leaseMs: 60_000 }) },
  );

  const result = spawnSync(process.execPath, [
    helperPath,
    'heartbeat',
    '--run-id',
    runId,
    '--lease-token',
    leaseToken,
    '--lease-ms',
    '60000',
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot, WORKFLOW_RUN_TOKEN: 'wrong-env-token-must-be-ignored' } });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
});

test('workflow runs API heartbeat renews matching worker lease', async () => {
  const runId = `${runPrefix}heartbeat-api`;
  const claim = await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const response = await heartbeatWorkflowRunAtRoot({ runsRoot, runId, leaseToken: claim.leaseToken, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.500Z') });

  assert.equal(response.ok, true);
  assert.equal('workerLease' in response.run, false);
  assert.equal(response.run.occupancy.leaseExpiresAt, '2026-06-01T10:01:00.500Z');
  const storedLease = (await readRunsIndex(runsIndexPathsForRoot(runsRoot))).runs[runId].workerLease;
  assert.deepEqual(Object.keys(storedLease).sort(), ['leaseExpiresAt', 'tokenEpoch', 'tokenHash']);
});

test('workflow runs API rejects tokenless renewal without mutating lease', async () => {
  const runId = `${runPrefix}partial-renewal`;
  await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });

  await assert.rejects(
    () => heartbeatWorkflowRunAtRoot({ runsRoot, runId, owner: 'alice', leaseMs: 60_000, now: new Date('2026-06-01T10:00:10.000Z') }),
    /workflow run token is required/,
  );

  const listed = await listWorkflowRunsAtRoot({ runsRoot, now: new Date('2026-06-01T10:00:10.000Z') });
  const run = listed.find((candidate) => candidate.runId === runId);
  assert.equal(run.occupancy.leaseExpiresAt, '2026-06-01T10:01:00.000Z');
});

test('workflow runs API renews stale matching-token claims without rotating authority', async () => {
  const runId = `${runPrefix}stale-token-claim`;
  const claim = await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });
  const before = (await readRunsIndex(runsIndexPathsForRoot(runsRoot))).runs[runId].workerLease;

  const response = await claimWorkflowRunAtRoot({ runsRoot, runId, leaseToken: claim.leaseToken, owner: 'alice', leaseMs: 60_000, now: new Date('2026-06-01T10:00:02.000Z') });

  assert.equal(response.ok, true);
  assert.equal('leaseToken' in response, false);
  assert.equal(response.run.occupancy.state, 'occupied');
  const after = (await readRunsIndex(runsIndexPathsForRoot(runsRoot))).runs[runId].workerLease;
  assert.equal(after.tokenHash, before.tokenHash);
  assert.equal(after.leaseExpiresAt, '2026-06-01T10:01:02.000Z');
});

test('workflow-runs CLI ignores stale WORKFLOW_RUN_TOKEN env when reclaiming stale lease', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  const runId = `${runPrefix}cli-stale-env-reclaim`;
  removeDefaultRunsForTestPrefix();
  await registerWorkflowRunAtRoot({ runsRoot: cliRunsRoot, runId, claim: true, owner: 'alice', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const result = spawnSync(process.execPath, [helperPath, 'claim', '--run-id', runId, '--owner', 'bob', '--lease-ms', '60000', '--takeover'], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot, WORKFLOW_RUN_TOKEN: 'wrong-stale-env-token' } });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(typeof response.leaseToken, 'string');
  assert.notEqual(response.leaseToken, 'wrong-stale-env-token');
});

test('workflow-runs CLI claim keeps JSON default and supports token-only stdout', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  const jsonRunId = `${runPrefix}cli-claim-json-default`;
  const tokenRunId = `${runPrefix}cli-claim-token-only`;
  removeDefaultRunsForTestPrefix();
  await registerWorkflowRunAtRoot({ runsRoot: cliRunsRoot, runId: jsonRunId, title: 'JSON default claim' });
  await registerWorkflowRunAtRoot({ runsRoot: cliRunsRoot, runId: tokenRunId, title: 'Token-only claim' });

  const jsonResult = spawnSync(process.execPath, [helperPath, 'claim', '--run-id', jsonRunId, '--owner', 'alice', '--lease-ms', '60000'], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  assert.equal(jsonResult.stderr, '');
  const jsonResponse = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResponse.ok, true);
  assert.equal(typeof jsonResponse.leaseToken, 'string');

  const tokenResult = spawnSync(process.execPath, [helperPath, 'claim', '--run-id', tokenRunId, '--owner', 'alice', '--lease-ms', '60000', '--print-lease-token'], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });
  assert.equal(tokenResult.status, 0, tokenResult.stderr);
  assert.equal(tokenResult.stderr, '');
  assert.match(tokenResult.stdout, /^[A-Za-z0-9_-]+\n$/);
  assert.doesNotMatch(tokenResult.stdout, /[{}":]/);

  const missingTokenResult = spawnSync(process.execPath, [helperPath, 'claim', '--run-id', tokenRunId, '--lease-token', tokenResult.stdout.trim(), '--print-lease-token'], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });
  assert.equal(missingTokenResult.status, 1);
  assert.equal(missingTokenResult.stdout, '');
  assert.match(missingTokenResult.stderr, /workflow-runs: claim did not return a lease token/);
});

test('workflow runs API rejects symlinked runs root for list without reading escaped index', async () => {
  const { escapedTarget, symlinkedRunsRoot } = makeSymlinkedRunsRoot();
  writeFileSync(path.join(escapedTarget, 'runs.json'), JSON.stringify({
    schemaVersion: 1,
    topologyVersion: 'workflow-runs-v1',
    runs: {},
  }));

  await assert.rejects(
    () => listWorkflowRunsAtRoot({ runsRoot: symlinkedRunsRoot }),
    /workflow runs root is unsafe because it is a symlink/,
  );
});

test('workflow runs API rejects symlinked runs root for create without write escape', async () => {
  await assertSymlinkedRunsRootRejected((symlinkedRunsRoot) => registerWorkflowRunAtRoot({
    runsRoot: symlinkedRunsRoot,
    runId: `${runPrefix}symlink-create`,
    title: 'Blocked create',
  }));
});

test('workflow runs API rejects symlinked runs root for claim without write escape', async () => {
  await assertSymlinkedRunsRootRejected((symlinkedRunsRoot) => claimWorkflowRunAtRoot({
    runsRoot: symlinkedRunsRoot,
    runId: `${runPrefix}symlink-claim`,
    owner: 'alice',
    leaseMs: 60_000,
  }));
});

test('workflow runs index operations reject symlinked runs root without write escape', async () => {
  await assertSymlinkedRunsRootRejected((symlinkedRunsRoot) => createRunIndexEntry(
    resolveRunPaths({ runId: `${runPrefix}symlink-index`, workflowPath: defaultWorkflow, runsRoot: symlinkedRunsRoot }),
    { title: 'Blocked index write' },
  ));
});

test('workflow runs index read rejects symlinked runs root before escaped index read', async () => {
  const { escapedTarget, symlinkedRunsRoot } = makeSymlinkedRunsRoot();
  writeFileSync(path.join(escapedTarget, 'runs.json'), '{not-json');

  await assert.rejects(
    () => readRunsIndex(runsIndexPathsForRoot(symlinkedRunsRoot)),
    /workflow runs root is unsafe because it is a symlink/,
  );
});

test('workflow runs list exposes occupied, stale, and unclaimed occupancy JSON plus summary text', async () => {
  await registerWorkflowRunAtRoot({ runsRoot, runId: `${runPrefix}list-occupied`, title: 'Occupied', claim: true, owner: 'alice', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await registerWorkflowRunAtRoot({ runsRoot, runId: `${runPrefix}list-stale`, title: 'Stale', claim: true, owner: 'bob', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await registerWorkflowRunAtRoot({ runsRoot, runId: `${runPrefix}list-unclaimed`, title: 'Unclaimed' });

  const runs = await listWorkflowRunsAtRoot({ runsRoot, now: new Date('2026-06-01T10:00:02.000Z') });
  const byId = new Map(runs.map((run) => [run.runId, run]));
  assert.equal(byId.get(`${runPrefix}list-occupied`).occupancy.state, 'occupied');
  assert.equal(byId.get(`${runPrefix}list-stale`).occupancy.state, 'stale');
  assert.equal(byId.get(`${runPrefix}list-unclaimed`).occupancy.state, 'unclaimed');
  for (const run of runs) {
    assert.equal('workerLease' in run, false);
    assert.equal('runDir' in run, false);
    assert.equal('runsRoot' in run, false);
    assert.equal('owner' in run.occupancy, false);
    assert.equal('harness' in run.occupancy, false);
    assert.equal('sessionId' in run.occupancy, false);
    assert.equal('workerId' in run.occupancy, false);
  }

  const summary = summarizeWorkflowRuns(runs);
  assert.match(summary, /1 occupied, 1 stale, 1 unclaimed/);
  assert.match(summary, new RegExp(`${runPrefix}list-occupied: running, occupied`));
});

test('workflow-runs CLI list exposes occupancy JSON and human-readable display', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  removeDefaultRunsForTestPrefix();
  await registerWorkflowRunAtRoot({ runsRoot: cliRunsRoot, runId: `${runPrefix}cli-occupied`, title: 'CLI Occupied', claim: true, owner: 'alice', leaseMs: 60_000 });
  await registerWorkflowRunAtRoot({ runsRoot: cliRunsRoot, runId: `${runPrefix}cli-unclaimed`, title: 'CLI Unclaimed' });

  const jsonResult = spawnSync(process.execPath, [helperPath, 'list'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const runs = JSON.parse(jsonResult.stdout);
  const occupiedRun = runs.find((run) => run.runId === `${runPrefix}cli-occupied`);
  assert.equal(occupiedRun.occupancy.state, 'occupied');
  assert.equal('owner' in occupiedRun.occupancy, false);
  assert.equal('harness' in occupiedRun.occupancy, false);
  assert.equal('sessionId' in occupiedRun.occupancy, false);
  assert.equal('workerId' in occupiedRun.occupancy, false);
  assert.equal(runs.find((run) => run.runId === `${runPrefix}cli-unclaimed`).occupancy.state, 'unclaimed');

  const humanResult = spawnSync(process.execPath, [helperPath, 'list', '--human'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });
  assert.equal(humanResult.status, 0, humanResult.stderr);
  assert.match(humanResult.stdout, new RegExp(`${runPrefix}cli-occupied: running, occupied`));
});

test('workflow-runs CLI usage documents heartbeat', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');

  const result = spawnSync(process.execPath, [helperPath, 'heartbeat'], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /heartbeat --run-id <id>/);
});

test('workflow-runs CLI public errors do not leak internal runs index path', () => {
  const indexPath = path.join(workflowRunsRoot, 'runs.json');
  const message = publicErrorMessage(`cannot parse workflow runs index from ${indexPath}: Unexpected token`);

  assert.match(message, /workflow runs index/);
  assert.doesNotMatch(message, /\.workflow-runs\/runs\.json/);
  assert.doesNotMatch(message, new RegExp(indexPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('workflow runs public API redacts corrupt index storage path', async () => {
  const apiRunsRoot = path.join(tempDir, '.workflow-runs-api-redaction');
  mkdirSync(apiRunsRoot, { recursive: true });
  writeFileSync(path.join(apiRunsRoot, 'runs.json'), '{not-json', { mode: 0o600 });

  await assert.rejects(
    () => listWorkflowRuns({ runsRoot: apiRunsRoot }),
    (error) => {
      assert.match(error.message, /workflow runs index/);
      assert.doesNotMatch(error.message, /\.workflow-runs-api-redaction/);
      assert.doesNotMatch(error.message, /runs\.json/);
      assert.doesNotMatch(error.message, new RegExp(apiRunsRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});

test('workflow-runs CLI public errors redact internal run-state lock paths', () => {
  const lockPath = path.join(workflowRunsRoot, `${runPrefix}redacted-lock`, '.workflow-runner', 'continue.lock');
  const message = publicErrorMessage(`cannot open ${lockPath}: EEXIST`);

  assert.match(message, /workflow run private state/);
  assert.doesNotMatch(message, /\.workflow-runs\//);
  assert.doesNotMatch(message, /continue\.lock/);
});

test('workflow-runs CLI heartbeat renews worker lease', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'skills/orbita/lib/entrypoints/cli/workflow-runs.mjs');
  const runId = `${runPrefix}cli-heartbeat`;
  const initialNow = new Date();
  const initialLeaseMs = 5 * 60 * 1000;
  removeDefaultRunsForTestPrefix();
  const claim = await registerWorkflowRunAtRoot({ runsRoot: cliRunsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: initialLeaseMs, now: initialNow });
  const initialLeaseExpiresAt = new Date(initialNow.getTime() + initialLeaseMs).toISOString();

  const result = spawnSync(process.execPath, [helperPath, 'heartbeat', '--run-id', runId, '--owner', 'alice', '--harness', 'portable', '--session-id', 'session-a', '--lease-ms', '60000', `--lease-token=${claim.leaseToken}`], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUNS_ROOT: cliRunsRoot, WORKFLOW_RUN_TOKEN: 'wrong-env-token-must-be-ignored' } });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal('workerLease' in response.run, false);
  assert.notEqual(response.run.occupancy.leaseExpiresAt, initialLeaseExpiresAt);
  assert.equal(Date.parse(response.run.occupancy.leaseExpiresAt) > Date.now(), true);
});
