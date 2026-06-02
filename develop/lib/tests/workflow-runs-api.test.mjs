import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { summarizeWorkflowRuns } from '../entrypoints/api/workflowRuns.mjs';
import { publicErrorMessage } from '../entrypoints/cli/public-error.mjs';
import { claimWorkflowRunAtRoot, heartbeatWorkflowRunAtRoot, listWorkflowRunsAtRoot, registerWorkflowRunAtRoot } from '../persistence/run-state/workflow-runs.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot } from '../persistence/run-state/run-index.mjs';
import { resolveRunPaths, workflowRunsRoot } from '../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runs-api-'));
const runsRoot = path.join(tempDir, 'runs');
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
  const runsIndexPath = path.join(workflowRunsRoot, 'runs.json');
  if (!existsSync(runsIndexPath)) return;
  const index = JSON.parse(readFileSync(runsIndexPath, 'utf8'));
  let changed = false;
  for (const runId of Object.keys(index.runs ?? {})) {
    if (!runId.startsWith(runPrefix)) continue;
    delete index.runs[runId];
    rmSync(path.join(workflowRunsRoot, runId), { recursive: true, force: true });
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

test('workflow runs API takes over stale lease after expiry', async () => {
  const runId = `${runPrefix}stale`;
  await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'generic', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const response = await claimWorkflowRunAtRoot({ runsRoot, runId, owner: 'bob', harness: 'portable', sessionId: 'session-b', leaseMs: 60_000, now: new Date('2026-06-01T10:00:02.000Z') });

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
  assert.match(storedLease.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(storedLease.tokenEpoch, 1);
  assert.equal(storedLease.tokenHash.includes(response.leaseToken), false);
  assert.equal(JSON.stringify(await listWorkflowRunsAtRoot({ runsRoot })).includes(response.leaseToken), false);
  assert.equal(JSON.stringify(await listWorkflowRunsAtRoot({ runsRoot })).includes(storedLease.tokenHash), false);
});

test('workflow runs API heartbeat renews matching worker lease', async () => {
  const runId = `${runPrefix}heartbeat-api`;
  const claim = await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const response = await heartbeatWorkflowRunAtRoot({ runsRoot, runId, leaseToken: claim.leaseToken, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.500Z') });

  assert.equal(response.ok, true);
  assert.equal('workerLease' in response.run, false);
  assert.equal(response.run.occupancy.leaseExpiresAt, '2026-06-01T10:01:00.500Z');
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

test('workflow runs API issues a new token when claiming a stale lease', async () => {
  const runId = `${runPrefix}stale-token-claim`;
  await registerWorkflowRunAtRoot({ runsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const response = await claimWorkflowRunAtRoot({ runsRoot, runId, owner: 'bob', leaseMs: 60_000, now: new Date('2026-06-01T10:00:02.000Z') });

  assert.equal(response.ok, true);
  assert.equal(typeof response.leaseToken, 'string');
  assert.equal(response.run.occupancy.state, 'occupied');
});

test('workflow-runs CLI ignores stale WORKFLOW_RUN_TOKEN env when reclaiming stale lease', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-runs.mjs');
  const runId = `${runPrefix}cli-stale-env-reclaim`;
  removeDefaultRunsForTestPrefix();
  await registerWorkflowRunAtRoot({ runsRoot: workflowRunsRoot, runId, claim: true, owner: 'alice', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const result = spawnSync(process.execPath, [helperPath, 'claim', '--run-id', runId, '--owner', 'bob', '--lease-ms', '60000'], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: 'wrong-stale-env-token' } });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(typeof response.leaseToken, 'string');
  assert.notEqual(response.leaseToken, 'wrong-stale-env-token');
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
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-runs.mjs');
  removeDefaultRunsForTestPrefix();
  await registerWorkflowRunAtRoot({ runsRoot: workflowRunsRoot, runId: `${runPrefix}cli-occupied`, title: 'CLI Occupied', claim: true, owner: 'alice', leaseMs: 60_000 });
  await registerWorkflowRunAtRoot({ runsRoot: workflowRunsRoot, runId: `${runPrefix}cli-unclaimed`, title: 'CLI Unclaimed' });

  const jsonResult = spawnSync(process.execPath, [helperPath, 'list'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const runs = JSON.parse(jsonResult.stdout);
  const occupiedRun = runs.find((run) => run.runId === `${runPrefix}cli-occupied`);
  assert.equal(occupiedRun.occupancy.state, 'occupied');
  assert.equal('owner' in occupiedRun.occupancy, false);
  assert.equal('harness' in occupiedRun.occupancy, false);
  assert.equal('sessionId' in occupiedRun.occupancy, false);
  assert.equal('workerId' in occupiedRun.occupancy, false);
  assert.equal(runs.find((run) => run.runId === `${runPrefix}cli-unclaimed`).occupancy.state, 'unclaimed');

  const humanResult = spawnSync(process.execPath, [helperPath, 'list', '--human'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(humanResult.status, 0, humanResult.stderr);
  assert.match(humanResult.stdout, new RegExp(`${runPrefix}cli-occupied: running, occupied`));
});

test('workflow-runs CLI usage documents heartbeat', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-runs.mjs');

  const result = spawnSync(process.execPath, [helperPath, 'heartbeat'], { cwd: root, encoding: 'utf8' });

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

test('workflow-runs CLI heartbeat renews worker lease', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-runs.mjs');
  const runId = `${runPrefix}cli-heartbeat`;
  removeDefaultRunsForTestPrefix();
  const claim = await registerWorkflowRunAtRoot({ runsRoot: workflowRunsRoot, runId, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 24 * 60 * 60 * 1000, now: new Date('2026-06-01T10:00:00.000Z') });

  const result = spawnSync(process.execPath, [helperPath, 'heartbeat', '--run-id', runId, '--owner', 'alice', '--harness', 'portable', '--session-id', 'session-a', '--lease-ms', '60000', '--lease-token', claim.leaseToken], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: 'wrong-env-token-must-be-ignored' } });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal('workerLease' in response.run, false);
  assert.notEqual(response.run.occupancy.leaseExpiresAt, '2026-06-01T10:00:01.000Z');
});
