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
  const root = await mkdtemp(join(tmpdir(), 'orbita-workflow-projection-'));
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

test('Orbita list includes registered sample workflow runs with safe metadata', async () => {
  await withRoot(async (root) => {
    const api = {
      runtime: {
        subagent: {
          async run() { return { runId: 'runtime-not-used' }; },
          async waitForRun() {},
          async getSessionMessages() { return { messages: [] }; },
        },
        workflowDrivers: { async start() {} },
      },
    };

    const created = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      requestId: 'orbita-list-safe-id',
      _positionals: ['implement safe list projection for private fixture'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });
    const listed = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(listed.ok, true);
    assert.equal(listed.workflow_runs.length, 1);
    assert.equal(listed.workflow_runs[0].workflow_run_id, created.workflow_run_id);
    assert.equal(listed.workflow_runs[0].request_id, 'orbita-list-safe-id');
    assert.equal(listed.workflow_runs[0].status, 'running');
    assert.equal(listed.workflow_runs[0].task_flow_id, null);
    assert.doesNotMatch(JSON.stringify(listed), /workflow\.json|leaseToken|transcript|prompt/);

    const native = formatNativeListText(listed);
    assert.match(native, /Workflow runs: 1/);
    assert.match(native, new RegExp(created.workflow_run_id));
    assert.match(native, /workflow id: `sample-workflow`/);
    assert.doesNotMatch(native, /workflow\.json|leaseToken|transcript|prompt/);
  });
});

test('Orbita inbox includes sample workflow approval gates that need human action', async () => {
  await withRoot(async (root) => {
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-inbox-approval`,
      title: 'sample workflow: inbox approval gate',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-inbox-approval-id',
      currentStep: 'approve_research',
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, registered.runId, 'approve_research');

    await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-inbox-running`,
      title: 'sample workflow: background worker still running',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'running',
      requestId: 'orbita-inbox-running-id',
      currentStep: 'research_draft',
    });
    await writeCanonicalBaton(root, `run-${process.pid}-inbox-running`, 'research_draft');

    const inbox = await runOrbita('inbox', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(inbox.ok, true);
    assert.equal(inbox.workflow_runs.length, 1);
    assert.equal(inbox.workflow_runs[0].workflow_run_id, registered.runId);
    assert.equal(inbox.workflow_runs[0].request_id, 'orbita-inbox-approval-id');
    assert.equal(inbox.workflow_runs[0].status, 'needs_host_actions');
    assert.equal(inbox.workflow_runs[0].user_action_required, true);
    assert.equal(inbox.workflow_runs[0].current_gate, 'approve_research');
    assert.equal(inbox.workflow_runs[0].current_step, 'approve_research');
    assert.deepEqual(inbox.workflow_runs[0].host_actions, [{ action: 'wait_for_approval', step_id: 'approve_research' }]);
    assert.equal(inbox.workflow_runs[0].waiting_reason, 'approval needed');
    assert.match(inbox.workflow_runs[0].elapsed, /^\d+[smhd]/);
    assert.doesNotMatch(JSON.stringify(inbox), /orbita-inbox-running-id|leaseToken|tokenHash|sessionId|\/Users\//);

    const native = formatNativeListText(inbox);
    assert.match(native, /Workflow runs: 1/);
    assert.match(native, new RegExp(registered.runId));
    assert.match(native, /waiting: approval needed/);
    assert.match(native, /step: approve_research/);
    assertNoRawNormalLabels(native);
    assertNoDuplicateStatusIcons(native);
    assert.doesNotMatch(native, /Активных runs нет/);
  });
});

test('Orbita status native output summarizes global workflow counts without raw statuses', async () => {
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


test('Orbita status falls back to generic workflow-run state', async () => {
  await withRoot(async (root) => {
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-status-generic`,
      title: 'Other workflow status check',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'another-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-status-generic-id',
      currentStep: 'review_packet',
      currentGate: 'review_packet',
    });
    await writeCanonicalBaton(root, registered.runId, 'approve_research');

    const status = await runOrbita('status', { run: registered.runId }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(status.ok, true);
    assert.equal(status.message, 'workflow_run_status');
    assert.equal(status.workflow_run.workflow_run_id, registered.runId);
    assert.equal(status.workflow_run.workflow_identity, 'another-workflow');
    assert.equal(status.workflow_run.user_action_required, true);
    assert.equal(status.workflow_run.status, 'needs_host_actions');
    assert.equal(status.workflow_run.current_gate, 'approve_research');
    assert.equal(status.workflow_run.current_step, 'approve_research');
    assert.deepEqual(status.workflow_run.host_actions, [{ action: 'wait_for_approval', step_id: 'approve_research' }]);
    assert.equal(status.workflow_run.waiting_reason, 'approval needed');
    assert.doesNotMatch(JSON.stringify(status), /review_packet|workflow\.json|leaseToken|tokenHash|transcript|prompt|\/Users\//);
  });
});


test('Orbita inbox ignores indexed host-action runs without canonical baton state', async () => {
  await withRoot(async (root) => {
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-indexed-inbox`,
      title: 'Other workflow pending review',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'another-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-indexed-inbox-id',
      currentStep: 'review_packet',
    });
    const inbox = await runOrbita('inbox', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(inbox.ok, true);
    assert.equal(inbox.workflow_runs.length, 0);
    assert.doesNotMatch(JSON.stringify(inbox), /review_packet|loadInstructionsCommand|redacted command|workflow\.json|leaseToken|transcript|prompt/);
  });
});

test('Orbita list sanitizes unsafe stored sample workflow titles at projection boundary', async () => {
  await withRoot(async (root) => {
    const unsafePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
    const unsafeTitle = `sample workflow: external stored title ${unsafePath} prompt: ${unsafePath} <<<BEGIN_TRANSCRIPT>>> lease-token=abcdefghijklmnopqrstuvwxyz1234567890 ghp_abcdefghijklmnopqrstuvwxyz123456 and extra text beyond the public title boundary`;
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-unsafe-title`,
      title: unsafeTitle,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-unsafe-title-id',
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, registered.runId, 'approve_research');

    const listed = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(listed.workflow_runs.length, 1);
    assert.equal(listed.workflow_runs[0].workflow_run_id, registered.runId);
    assert.equal(listed.workflow_runs[0].request_id, 'orbita-unsafe-title-id');
    assert.equal(listed.workflow_runs[0].user_action_required, true);
    assert.equal(Object.hasOwn(listed.workflow_runs[0], 'current_gate'), false);
    assert.equal(Object.hasOwn(listed.workflow_runs[0], 'current_step'), false);
    assert.equal(Object.hasOwn(listed.workflow_runs[0], 'host_actions'), false);
    assert.equal(Object.hasOwn(listed.workflow_runs[0], 'waiting_reason'), false);
    assert.match(listed.workflow_runs[0].title, /^sample workflow: external stored title/);
    assert.ok(listed.workflow_runs[0].title.length <= 96);
    assert.match(listed.workflow_runs[0].title, /\[redacted-/);
    assert.doesNotMatch(JSON.stringify(listed), /Users|sergey|private|prompt|transcript|BEGIN_TRANSCRIPT|requesterBinding|sessionRef|origin|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);

    const native = formatNativeListText(listed);
    assert.match(native, /workflow id: `sample-workflow`/);
    assert.match(native, /waiting: waiting for you/);
    assertNoRawNormalLabels(native);
    assertNoDuplicateStatusIcons(native);
    assert.match(native, /sample workflow: external stored title/);
    assert.doesNotMatch(native, /Users|sergey|private|prompt|transcript|BEGIN_TRANSCRIPT|requesterBinding|sessionRef|origin|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);
  });
});

test('Orbita public workflow projection sanitizes unsafe request ids and workflow identity', async () => {
  await withRoot(async (root) => {
    const unsafePath = join('/', 'Users', 'sergey', 'request-id.txt');
    const runId = `run-${process.pid}-unsafe-public-token`;
    await registerWorkflowRun({
      runsRoot: root,
      runId,
      title: 'public token sanitization workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: `sample ${unsafePath}`,
      status: 'needs_host_actions',
      requestId: `orbita-${unsafePath}`,
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, runId, 'approve_research');

    const listed = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const status = await runOrbita('status', { run: runId }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const opened = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(Object.hasOwn(listed.workflow_runs[0], 'request_id'), false);
    assert.equal(Object.hasOwn(status.workflow_run, 'request_id'), false);
    assert.equal(Object.hasOwn(opened, 'request_id'), false);
    assert.match(listed.workflow_runs[0].workflow_identity, /\[redacted-/);
    assert.match(status.workflow_run.workflow_identity, /\[redacted-/);
    assert.doesNotMatch(JSON.stringify({ listed, status, opened }), /Users|sergey/);
    assert.doesNotMatch(opened.user_action_text, /Request ID: orbita-|Users|sergey/);
  });
});
