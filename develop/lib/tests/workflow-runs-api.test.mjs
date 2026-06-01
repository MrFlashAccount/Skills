import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { claimWorkflowRun, listWorkflowRuns, registerWorkflowRun, summarizeWorkflowRuns } from '../entrypoints/api/workflowRuns.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runs-api-'));
const runsRoot = path.join(tempDir, 'runs');
const runsIndexPath = path.join(runsRoot, 'runs.json');
const defaultWorkflow = path.join(root, 'workflows/dev-harness/workflow.json');
const runPrefix = `runs-api-${process.pid}-`;

function resetIndex(content) {
  rmSync(runsRoot, { recursive: true, force: true });
  if (content !== undefined) {
    mkdirSync(runsRoot, { recursive: true });
    writeFileSync(runsIndexPath, content);
  }
}

beforeEach(() => resetIndex(undefined));
after(() => rmSync(tempDir, { recursive: true, force: true }));

test('workflow runs API lists empty array when index is missing', async () => {
  assert.deepEqual(await listWorkflowRuns({ runsRoot }), []);
});

test('workflow runs API fails controlled when index JSON is invalid', async () => {
  resetIndex('{not-json');

  await assert.rejects(
    () => listWorkflowRuns({ runsRoot }),
    /cannot parse workflow runs index/,
  );
});

test('workflow runs API creates accepted safe run id with public metadata only', async () => {
  const runId = `${runPrefix}safe`;
  const response = await registerWorkflowRun({
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
  assert.deepEqual(response.workflow, { identity: 'dev-harness', path: defaultWorkflow });
  assert.equal(response.status, 'running');
  assert.equal(response.taskKey, 'task:key/1');
  assert.equal(response.taskFingerprint, 'fingerprint-1');
  assert.equal(response.workerLease, null);
  assert.equal('runDir' in response, false);
  assert.equal('runsRoot' in response, false);

  const listed = await listWorkflowRuns({ runsRoot });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].runId, runId);
  assert.equal('runDir' in listed[0], false);
  assert.equal('runsRoot' in listed[0], false);
});

test('workflow runs API generates a safe run id when omitted', async () => {
  const response = await registerWorkflowRun({ runsRoot, title: 'Generated run' });

  assert.match(response.runId, /^run-[0-9a-f-]{36}$/);
  assert.equal(response.title, 'Generated run');
  assert.equal(response.workflow.path, defaultWorkflow);
});

test('workflow runs API rejects unsafe run id', async () => {
  await assert.rejects(
    () => registerWorkflowRun({ runsRoot, runId: '../unsafe' }),
    /invalid workflow runId/,
  );
});

test('workflow runs API rejects duplicate run id instead of overwriting', async () => {
  const runId = `${runPrefix}duplicate`;
  await registerWorkflowRun({ runsRoot, runId, title: 'First' });

  await assert.rejects(
    () => registerWorkflowRun({ runsRoot, runId, title: 'Second' }),
    /workflow run already exists/,
  );
  const listed = await listWorkflowRuns({ runsRoot });
  assert.equal(listed[0].title, 'First');
});

test('workflow runs API rejects occupied fresh lease owned by someone else', async () => {
  const runId = `${runPrefix}occupied`;
  const now = new Date('2026-06-01T10:00:00.000Z');
  await registerWorkflowRun({ runsRoot, runId, claim: true, owner: 'alice', harness: 'generic', sessionId: 'session-a', leaseMs: 60_000, now });

  const response = await claimWorkflowRun({ runsRoot, runId, owner: 'bob', harness: 'generic', sessionId: 'session-b', now: new Date('2026-06-01T10:00:10.000Z') });

  assert.equal(response.ok, false);
  assert.equal(response.reason, 'occupied');
  assert.equal(response.run.occupancy.state, 'occupied');
  assert.equal(response.run.workerLease.owner, 'alice');
});

test('workflow runs API takes over stale lease after expiry', async () => {
  const runId = `${runPrefix}stale`;
  await registerWorkflowRun({ runsRoot, runId, claim: true, owner: 'alice', harness: 'generic', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const response = await claimWorkflowRun({ runsRoot, runId, owner: 'bob', harness: 'portable', sessionId: 'session-b', leaseMs: 60_000, now: new Date('2026-06-01T10:00:02.000Z') });

  assert.equal(response.ok, true);
  assert.equal(response.claimed, true);
  assert.equal(response.run.occupancy.state, 'occupied');
  assert.equal(response.run.workerLease.owner, 'bob');
  assert.equal(response.run.workerLease.harness, 'portable');
});

test('workflow runs list exposes occupied, stale, and unclaimed occupancy JSON plus summary text', async () => {
  await registerWorkflowRun({ runsRoot, runId: `${runPrefix}list-occupied`, title: 'Occupied', claim: true, owner: 'alice', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await registerWorkflowRun({ runsRoot, runId: `${runPrefix}list-stale`, title: 'Stale', claim: true, owner: 'bob', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await registerWorkflowRun({ runsRoot, runId: `${runPrefix}list-unclaimed`, title: 'Unclaimed' });

  const runs = await listWorkflowRuns({ runsRoot, now: new Date('2026-06-01T10:00:02.000Z') });
  const byId = new Map(runs.map((run) => [run.runId, run]));
  assert.equal(byId.get(`${runPrefix}list-occupied`).occupancy.state, 'occupied');
  assert.equal(byId.get(`${runPrefix}list-stale`).occupancy.state, 'stale');
  assert.equal(byId.get(`${runPrefix}list-unclaimed`).occupancy.state, 'unclaimed');

  const summary = summarizeWorkflowRuns(runs);
  assert.match(summary, /1 occupied, 1 stale, 1 unclaimed/);
  assert.match(summary, new RegExp(`${runPrefix}list-occupied: running, occupied`));
});

test('workflow-runs CLI list exposes occupancy JSON and human-readable display', async () => {
  const { spawnSync } = await import('node:child_process');
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-runs.mjs');
  await registerWorkflowRun({ runsRoot, runId: `${runPrefix}cli-occupied`, title: 'CLI Occupied', claim: true, owner: 'alice', leaseMs: 60_000 });
  await registerWorkflowRun({ runsRoot, runId: `${runPrefix}cli-unclaimed`, title: 'CLI Unclaimed' });

  const env = { ...process.env, WORKFLOW_RUNS_ROOT: runsRoot };
  const jsonResult = spawnSync(process.execPath, [helperPath, 'list'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const runs = JSON.parse(jsonResult.stdout);
  assert.equal(runs.find((run) => run.runId === `${runPrefix}cli-occupied`).occupancy.state, 'occupied');
  assert.equal(runs.find((run) => run.runId === `${runPrefix}cli-unclaimed`).occupancy.state, 'unclaimed');

  const humanResult = spawnSync(process.execPath, [helperPath, 'list', '--human'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(humanResult.status, 0, humanResult.stderr);
  assert.match(humanResult.stdout, /workflow runs: 2 total, 1 occupied, 0 stale, 1 unclaimed/);
  assert.match(humanResult.stdout, new RegExp(`${runPrefix}cli-occupied: running, occupied`));
});
