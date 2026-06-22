import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { continueRun, next, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import { registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';
import { deliverWorkflowResponseToRequester, readWorkflowRunCanonicalState } from '../entrypoints/orbita/workflowAdapter.mjs';

const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));

function orbitaPluginConfig(root) {
  return { workflowRunsRoot: root, workflowPath: TEST_SAMPLE_WORKFLOW };
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-workflow-session-delivery-'));
  try {
    await fn(root);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

async function waitFor(predicate, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for condition');
}

async function clearWorkerLease(root, runId) {
  const indexPath = join(root, 'runs.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  index.runs[runId].workerLease = null;
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function validResearchAttackVerdict(summary = 'Approved.') {
  return {
    summary: [summary],
    evidence_checked: ['research_draft output'],
    findings: [{
      category: 'can',
      severity: 'can',
      summary: 'Research packet is consistent.',
      description: 'The research draft output was reviewed and no blocking issue was identified.',
      evidence: [{ ref: 'research_draft output', details: 'Research packet was available for critic review.' }],
      recommendation: 'Proceed to approval.',
    }],
  };
}

async function createSampleWorkflowApprovalRun(root, runId) {
  const registered = await registerWorkflowRun({
    runsRoot: root,
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    title: `sample workflow: ${runId}`,
    status: 'running',
    requestId: `orbita-${runId}`,
    requesterBinding: { sessionRef: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
    claim: true,
    owner: 'test',
    workerId: 'test-worker',
    leaseMs: 60_000,
  });

  let response = await next({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken, userPrompt: 'direct control test' });
  assert.equal(response.requests[0].stepId, 'research_draft');
  const artifactDir = join(root, runId, 'research_draft', 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, 'research.md');
  await writeFile(artifactPath, 'Research packet fixture.');
  await writeOutput({
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    runsRoot: root,
    leaseToken: registered.leaseToken,
    stepId: 'research_draft',
    json: JSON.stringify({
      outcome: 'ready_for_attack',
      research_packet: {
        summary: ['Research ready.'],
        scope: { in_scope: ['direct control'], out_of_scope: [] },
        constraints: [],
        risks: [],
        open_questions: [],
        recommendation: 'Approve research.',
      },
      artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
    }),
  });
  response = await continueRun({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken });
  assert.equal(response.requests[0].stepId, 'research_attack');
  await writeOutput({
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    runsRoot: root,
    leaseToken: registered.leaseToken,
    stepId: 'research_attack',
    json: JSON.stringify({ outcome: 'approved', verdict: validResearchAttackVerdict() }),
  });
  response = await continueRun({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken });
  assert.equal(response.requests[0].stepId, 'approve_research');
  await clearWorkerLease(root, runId);
  return response;
}

async function createRegisteredTerminalRun(root, runId) {
  await registerWorkflowRun({
    runsRoot: root,
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    title: `sample workflow: ${runId}`,
    status: 'done',
    requestId: `orbita-${runId}`,
    requesterBinding: { sessionRef: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
  });
  return { runId, status: 'done', requestId: `orbita-${runId}`, baton: { cursor: 'done' }, requests: [] };
}

function deliveryApi({ sends = [], runDriver = true, workerOutcome = 'ready' } = {}) {
  return {
    runtime: {
      sessions: {
        async send(params) {
          sends.push(params);
          return { ok: true, runId: params.idempotencyKey };
        },
      },
      workflowDrivers: {
        async start(params) {
          if (runDriver) setImmediate(() => { void params.run().catch(() => {}); });
        },
      },
      subagent: {
        messages: new Map(),
        async run({ message, sessionKey }) {
          const stepId = message.match(/Step: (\S+)/)?.[1];
          const output = stepId === 'research_draft'
            ? { outcome: 'ready_for_attack', research_packet: { summary: ['Research revised.'], scope: { in_scope: [], out_of_scope: [] }, constraints: [], risks: [], open_questions: [], recommendation: 'Approve research.' } }
            : stepId === 'research_attack'
              ? { outcome: 'approved', verdict: validResearchAttackVerdict('Research revised and approved.') }
              : { outcome: workerOutcome };
          this.messages.set(sessionKey, [{ role: 'assistant', content: JSON.stringify(output) }]);
          return { runId: `runtime-${stepId}` };
        },
        async waitForRun() {},
        async getSessionMessages({ sessionKey }) { return { messages: this.messages.get(sessionKey) ?? [] }; },
      },
    },
  };
}

function assertPublicDeliveryClean(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /requesterBinding|sessionRef|origin|leaseToken|workflow\.json|BEGIN_PROMPT|BEGIN_TRANSCRIPT|raw prompt|schema/i);
  assert.doesNotMatch(text, /\/tmp\/orbita|\/Users\/sergey|research_draft\/artifacts\/research\.md/);
}

test('Orbita approve continuation delivers one terminal status to requester session', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-terminal`;
    await createSampleWorkflowApprovalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:approver-b' }, api });
    assert.equal(ack.ok, true);
    assert.equal(ack.status, 'needs_host_actions');

    await waitFor(() => sends.length === 1);
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.match(sends[0].message, /Orbita workflow update/);
    assert.match(sends[0].message, /done/);
    assertPublicDeliveryClean(sends[0]);
  });
});

test('Orbita reject continuation delivers next user approval card with safe attachments', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-next-gate`;
    await createSampleWorkflowApprovalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });

    const ack = await runOrbita('reject', { _positionals: [runId, 'revise'] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:requester-a' }, api });
    assert.equal(ack.ok, true);

    await waitFor(() => sends.length === 1);
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.match(sends[0].message, /Orbita ждёт approval/);
    assert.match(sends[0].message, new RegExp(`/orbita approve ${runId}`));
    assert.equal(sends[0].attachments?.length, 1);
    assert.equal(sends[0].attachments[0].id, 'research-packet');
    assertPublicDeliveryClean(sends[0]);
  });
});

test('Orbita worker-only background gate does not send before a user-facing state', async () => {
  await withRoot(async (root) => {
    const sends = [];
    const api = deliveryApi({ sends, runDriver: false });
    const result = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['worker-only state'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'agent:main:requester-a' },
      api,
    });
    assert.equal(result.ok, true);
    assert.equal(sends.length, 0);
  });
});

test('Orbita workflow delivery skips missing or unsafe requester target safely', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-unsafe-target`;
    await createSampleWorkflowApprovalRun(root, runId);
    const indexPath = join(root, 'runs.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.runs[runId].requesterBinding = { sessionRef: '/tmp/orbita/private-session', origin: { channel: 'telegram' } };
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    const sends = [];
    const api = deliveryApi({ sends });

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: '/tmp/orbita/private-session' }, api });
    assert.equal(ack.ok, true);
    await waitFor(async () => {
      const state = await readWorkflowRunCanonicalState(orbitaPluginConfig(root), runId);
      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      return state.response.status === 'done' && index.runs[runId].workflowDeliveries?.[0]?.status === 'skipped';
    });
    assert.equal(sends.length, 0);
    const updated = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const [delivery] = updated.runs[runId].workflowDeliveries ?? [];
    assert.equal(delivery?.marker, `${runId}:terminal:done`);
    assert.equal(delivery?.status, 'skipped');
    assert.equal(delivery?.reason, 'missing_or_unsafe_requester_target');
    assert.equal(delivery?.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    assertPublicDeliveryClean(delivery);
  });
});


test('Orbita successful requester delivery suppresses later duplicate delivery', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-success-suppresses-duplicate`;
    const response = await createRegisteredTerminalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });

    const first = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });
    const second = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(first.sent, true);
    assert.equal(second.sent, false);
    assert.equal(second.reason, 'duplicate');
    assert.equal(sends.length, 1);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const deliveries = index.runs[runId].workflowDeliveries ?? [];
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'success');
    assertPublicDeliveryClean(deliveries[0]);
  });
});

test('Orbita persisted pending requester delivery marker suppresses duplicate send', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-pending-suppresses-duplicate`;
    const response = await createRegisteredTerminalRun(root, runId);
    const indexPath = join(root, 'runs.json');
    const marker = `${runId}:terminal:done`;
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.runs[runId].workflowDeliveries = [{
      marker,
      status: 'pending',
      claimedAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString(),
      method: '/tmp/orbita/private-session',
      key: 'token=sk-secretsecretsecret',
      reason: 'raw prompt private detail',
    }];
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    const sends = [];
    const api = deliveryApi({ sends });

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, false);
    assert.equal(result.reason, 'duplicate');
    assert.equal(result.status, 'pending');
    assert.equal(result.durable, true);
    assert.equal(sends.length, 0);
    assert.equal(result.delivery.status, 'pending');
    assert.equal(result.delivery.marker, marker);
    assertPublicDeliveryClean(result);
    const updated = JSON.parse(await readFile(indexPath, 'utf8'));
    assert.equal(updated.runs[runId].workflowDeliveries.length, 1);
    assert.equal(updated.runs[runId].workflowDeliveries[0].status, 'pending');
  });
});

test('Orbita concurrent background re-drive sends only one requester delivery', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-concurrent-idempotent`;
    await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      title: `sample workflow: ${runId}`,
      status: 'done',
      requestId: `orbita-${runId}`,
      requesterBinding: { sessionRef: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
    });
    const sends = [];
    const api = deliveryApi({ sends });
    api.runtime.sessions.send = async (params) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      sends.push(params);
      return { ok: true, runId: params.idempotencyKey };
    };
    const response = { runId, status: 'done', requestId: `orbita-${runId}`, baton: { cursor: 'done' }, requests: [] };

    const results = await Promise.all([
      deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW }),
      deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW }),
    ]);

    assert.equal(results.filter((result) => result.sent).length, 1);
    assert.equal(results.filter((result) => result.reason === 'duplicate' && result.status === 'pending').length, 1);
    assert.equal(sends.length, 1);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const deliveries = index.runs[runId].workflowDeliveries ?? [];
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'success');
    assert.equal(deliveries[0].key, sends[0].idempotencyKey);
  });
});

test('Orbita failed requester delivery persists sanitized diagnostics', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-failed-diagnostics`;
    await createSampleWorkflowApprovalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    api.runtime.sessions.send = async () => { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret'); };

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:approver-b' }, api });
    assert.equal(ack.ok, true);
    await waitFor(async () => {
      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      return index.runs[runId].workflowDeliveries?.[0]?.status === 'failed';
    });
    assert.equal(sends.length, 0);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const [delivery] = index.runs[runId].workflowDeliveries ?? [];
    assert.equal(delivery.marker, `${runId}:terminal:done`);
    assert.equal(delivery.status, 'failed');
    assert.match(delivery.reason, /^(send_failed|runtime_session_delivery_failed_with_attachments)$/);
    assert.equal(delivery.method, 'runtime.sessions.send');
    assert.equal(delivery.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.ok(delivery.claimedAt);
    assert.ok(delivery.completedAt);
    assertPublicDeliveryClean(delivery);
  });
});


test('Orbita failed requester delivery can be retried on later re-drive', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-failed-retry`;
    const response = await createRegisteredTerminalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    api.runtime.sessions.send = async () => { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret'); };

    const failed = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });
    assert.equal(failed.sent, false);
    assert.equal(failed.status, 'failed');

    api.runtime.sessions.send = async (params) => {
      sends.push(params);
      return { ok: true };
    };
    const retried = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(retried.sent, true);
    assert.equal(sends.length, 1);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const deliveries = index.runs[runId].workflowDeliveries ?? [];
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'success');
    assertPublicDeliveryClean(deliveries[0]);
  });
});

test('Orbita skipped requester delivery can be retried after target becomes safe', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-skipped-retry`;
    const response = await createRegisteredTerminalRun(root, runId);
    const indexPath = join(root, 'runs.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.runs[runId].requesterBinding = { sessionRef: '/tmp/orbita/private-session', origin: { channel: 'telegram' } };
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    const sends = [];
    const api = deliveryApi({ sends });

    const skipped = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });
    assert.equal(skipped.sent, false);
    assert.equal(skipped.reason, 'missing_or_unsafe_requester_target');

    const retryIndex = JSON.parse(await readFile(indexPath, 'utf8'));
    retryIndex.runs[runId].requesterBinding = { sessionRef: 'agent:main:requester-a', origin: { channel: 'telegram' } };
    await writeFile(indexPath, `${JSON.stringify(retryIndex, null, 2)}\n`, 'utf8');
    const retried = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(retried.sent, true);
    assert.equal(sends.length, 1);
    const updated = JSON.parse(await readFile(indexPath, 'utf8'));
    const deliveries = updated.runs[runId].workflowDeliveries ?? [];
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, 'success');
    assertPublicDeliveryClean(deliveries[0]);
  });
});

test('Orbita failed requester delivery returns only sanitized public diagnostics', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-return-failed`;
    const response = await createRegisteredTerminalRun(root, runId);
    const api = deliveryApi();
    api.runtime.sessions.send = async () => { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret sessionRef=agent:main:private'); };

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'send_failed');
    assert.equal(result.method, 'runtime.sessions.send');
    assert.equal(result.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(result.failedAttemptCount, 1);
    assert.equal(Object.hasOwn(result, 'failedAttempts'), false);
    assert.equal(Object.hasOwn(result, 'error'), false);
    assertPublicDeliveryClean(result);
  });
});

test('Orbita requester delivery fallback success returns no raw sender internals', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-return-fallback`;
    const response = await createRegisteredTerminalRun(root, runId);
    const api = deliveryApi();
    api.runtime.sessions.send = async () => { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret'); };
    api.runtime.chat = {
      async send() {
        return { ok: true, localPath: '/Users/sergey/private/result.json', token: 'sk-secretsecretsecret', sessionRef: 'agent:main:private' };
      },
    };

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, true);
    assert.equal(result.status, 'success');
    assert.equal(result.method, 'runtime.chat.send');
    assert.equal(result.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(result.attempts, 2);
    assert.equal(result.failedAttemptCount, 1);
    assert.equal(Object.hasOwn(result, 'failedAttempts'), false);
    assert.equal(Object.hasOwn(result, 'result'), false);
    assertPublicDeliveryClean(result);
  });
});

test('Orbita duplicate background delivery attempt records durable idempotency marker', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-idempotent`;
    await createSampleWorkflowApprovalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    api.runtime.workflowDrivers.start = async (params) => {
      setImmediate(() => {
        void (async () => {
          await params.run().catch(() => {});
          await params.run().catch(() => {});
        })();
      });
    };

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:requester-a' }, api });
    assert.equal(ack.ok, true);
    await waitFor(() => sends.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sends.length, 1);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.deepEqual(index.runs[runId].workflowDeliveries.map((entry) => entry.marker), [`${runId}:terminal:done`]);
  });
});

test('Orbita durable delivery marker skips re-drive after process restart', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-durable-redrive`;
    await createSampleWorkflowApprovalRun(root, runId);
    const indexPath = join(root, 'runs.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.runs[runId].workflowDeliveries = [{ marker: `${runId}:terminal:done`, deliveredAt: new Date().toISOString(), method: 'runtime.sessions.send' }];
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    const sends = [];
    const api = deliveryApi({ sends });

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:requester-a' }, api });
    assert.equal(ack.ok, true);
    await waitFor(async () => (await readWorkflowRunCanonicalState(orbitaPluginConfig(root), runId)).response.status === 'done');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sends.length, 0);
  });
});

test('Orbita requester delivery tries later runtime senders after a sender failure', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-fallback`;
    await createSampleWorkflowApprovalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    api.runtime.sessions.send = async () => { throw new Error('primary sender down'); };
    api.runtime.chat = {
      async send(params) {
        sends.push(params);
        return { ok: true };
      },
    };

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:approver-b' }, api });
    assert.equal(ack.ok, true);
    await waitFor(() => sends.length === 1);
    assert.equal(sends[0].sessionKey, 'agent:main:requester-a');
    assert.match(sends[0].message, /Orbita workflow update/);
    assertPublicDeliveryClean(sends[0]);
  });
});

test('Orbita runtime adapter docs do not claim implemented same-session worker clarification routing', async () => {
  const docsPath = fileURLToPath(new URL('../../docs/workflow-runtime-adapter.md', import.meta.url));
  const docs = await readFile(docsPath, 'utf8');

  assert.match(docs, /does not route same-session worker clarification replies/);
  assert.match(docs, /parses one strict JSON output/);
  assert.doesNotMatch(docs, /allowed same-session continuation/);
});
