import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { formatNativeListText, formatNativeStatusText, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));

function orbitaPluginConfig(root, workflowPath = TEST_SAMPLE_WORKFLOW) {
  return { workflowRunsRoot: root, workflowPath };
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-status-formatting-'));
  try {
    await fn(root);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

async function writeCanonicalBaton(root, runId, cursor = 'approve_research') {
  await mkdir(join(root, runId), { recursive: true, mode: 0o700 });
  await writeFile(join(root, runId, 'baton.json'), `${JSON.stringify({ cursor, status: 'running', state: { artifacts: [], results: [] } }, null, 2)}\n`, { mode: 0o600 });
}

function assertNoRawNormalLabels(native) {
  assert.doesNotMatch(native, /\bcurrent step\b|currentStep|\bcurrent gate\b|currentGate|\baction:/i);
}

function assertNoDuplicateStatusIcons(native) {
  const itemIcons = /[✅🔴⛔🛑🟡❔🔧🔵⚪]/gu;
  for (const line of native.split('\n')) {
    const matches = line.match(itemIcons) ?? [];
    assert.ok(matches.length <= 1, `line should have at most one status icon: ${line}`);
  }
}

test('Orbita status native output summarizes global workflow counts without raw statuses or ids', async () => {
  await withRoot(async (root) => {
    await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-running`,
      title: 'status summary running workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'running',
      requestId: 'orbita-status-running-id',
      currentStep: 'research_draft',
    });
    await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-approval`,
      title: 'status summary approval workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-status-approval-id',
      currentStep: 'approve_research',
      currentGate: 'approve_research',
    });
    await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-failed`,
      title: 'status summary failed workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'failed',
      requestId: 'orbita-status-failed-id',
    });
    await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-done`,
      title: 'status summary done workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'done',
      requestId: 'orbita-status-done-id',
    });
    await writeCanonicalBaton(root, `run-${process.pid}-status-running`, 'research_draft');
    await writeCanonicalBaton(root, `run-${process.pid}-status-approval`, 'approve_research');
    await writeCanonicalBaton(root, `run-${process.pid}-status-failed`, 'research_draft');
    await writeCanonicalBaton(root, `run-${process.pid}-status-done`, 'done');

    const status = await runOrbita('status', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const native = formatNativeStatusText(status);

    assert.deepEqual(status.status_summary, { total: 4, active: 1, pending: 1, failed: 1, done: 1, approvals: 1 });
    assert.match(native, /^🪐 Orbita status/);
    assert.match(native, /Всего: 4/);
    assert.match(native, /🔵 Активные\/running: 1/);
    assert.match(native, /🟡 Inbox \/ ждут тебя: 1/);
    assert.match(native, /🔴 Failed: 1/);
    assert.match(native, /✅ Done: 1/);
    assert.doesNotMatch(native, /Approvals\/questions/);
    assertNoRawNormalLabels(native);
    assertNoDuplicateStatusIcons(native);
    assert.doesNotMatch(native, /needs_host_actions|status-running|status-approval|status-failed|status-done/);
  });
});

test('Orbita status reuses inbox projection for waits-for-you counts and keeps worker indicators consistent', async () => {
  await withRoot(async (root) => {
    const approval = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-shared-approval`,
      title: 'approval workflow waits for you',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-status-shared-approval-id',
      currentStep: 'approve_research',
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, approval.runId, 'approve_research');
    const worker = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-shared-worker`,
      title: 'worker only workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-status-shared-worker-id',
      currentStep: 'research_draft',
    });
    await writeCanonicalBaton(root, worker.runId, 'research_draft');
    const inbox = await runOrbita('inbox', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const status = await runOrbita('status', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const list = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const workerStatus = await runOrbita('status', { run: worker.runId }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(inbox.workflow_runs.length, 1);
    assert.equal(inbox.workflow_runs[0].workflow_run_id, approval.runId);
    assert.doesNotMatch(JSON.stringify(inbox), new RegExp(worker.runId));
    assert.equal(status.status_summary.pending, inbox.workflow_runs_meta.total);
    assert.equal(status.status_summary.active, 1);
    assert.equal(status.status_summary.approvals, 1);
    const native = formatNativeStatusText(status);
    assert.match(native, /🟡 Inbox \/ ждут тебя: 1/);
    assert.doesNotMatch(native, /Approvals\/questions/);
    assertNoRawNormalLabels(native);
    assertNoDuplicateStatusIcons(native);

    const listNative = formatNativeListText(list);
    const workerStatusNative = formatNativeStatusText(workerStatus);
    assert.match(listNative, /🔧 worker only workflow/);
    assert.match(listNative, /worker action pending/i);
    assertNoRawNormalLabels(listNative);
    assertNoDuplicateStatusIcons(listNative);
    assert.match(workerStatusNative, /🔧 worker only workflow/);
    assert.match(workerStatusNative, /worker action pending/i);
    assertNoRawNormalLabels(workerStatusNative);
    assertNoDuplicateStatusIcons(workerStatusNative);
  });
});

test('Orbita status native output shows selected run details with user-facing state', async () => {
  await withRoot(async (root) => {
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-selected`,
      title: 'selected approval workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-status-selected-id',
      currentStep: 'approve_research',
      currentGate: 'approve_research',
      claim: true,
      owner: 'test-owner',
      sessionId: '/Users/secret/local/session-path',
      workerId: 'worker-secret',
      leaseMs: 60_000,
    });
    await writeCanonicalBaton(root, registered.runId, 'approve_research');

    const status = await runOrbita('status', { run: registered.runId }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const native = formatNativeStatusText(status);

    assert.equal(status.status_scope, 'run');
    assert.match(native, new RegExp(registered.runId));
    assert.equal(status.workflow_run.current_step, 'approve_research');
    assert.equal(status.workflow_run.current_gate, 'approve_research');
    assert.equal(status.workflow_run.waiting_reason, 'approval needed');
    assert.match(status.workflow_run.elapsed, /^\d+[smhd]/);
    assert.match(status.workflow_run.updated_age, /^\d+[smhd]/);
    assert.match(native, /step: approve_research/);
    assert.match(native, /gate: approve_research/);
    assert.match(native, /waiting: approval needed/);
    assert.match(native, /age: \d+[smhd]/);
    assert.equal(status.workflow_run.lease_state, 'busy');
    assert.match(native, /lease: busy/);
    const serialized = JSON.stringify(status);
    assert.doesNotMatch(serialized, new RegExp(registered.leaseToken));
    assert.doesNotMatch(serialized, /tokenHash|leaseToken|worker-secret|session-path|\/Users\//);
    assert.doesNotMatch(native, /tokenHash|leaseToken|worker-secret|session-path|\/Users\//);
    assertNoRawNormalLabels(native);
    assertNoDuplicateStatusIcons(native);
    assert.doesNotMatch(native, /needs_host_actions/);
  });
});
