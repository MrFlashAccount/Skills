import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { continueRun, next, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import { registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';
import { ORBITA_RELAY_EVENT_TYPE } from '../entrypoints/orbita/gatewaySessionRelay.mjs';
import { deliverWorkflowResponseToRequester, markWorkflowRunFailed, readWorkflowRunCanonicalState } from '../entrypoints/orbita/workflowAdapter.mjs';

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


function makeMockGatewayClient({ onRequest, clients } = {}) {
  return class MockGatewayClient {
    constructor(options) {
      this.options = options;
      clients?.push(this);
    }
    start() {
      setImmediate(() => this.options.onHelloOk?.({ ok: true }));
    }
    async request(method, params, options) {
      assert.equal(method, 'sessions.send');
      return onRequest ? onRequest({ method, params, options }) : { ok: true, runId: params.idempotencyKey };
    }
    async stopAndWait() {}
  };
}

function deliveryApi({ sends = [], runDriver = true, workerOutcome = 'ready', workerOutputs = {} } = {}) {
  const MockGatewayClient = makeMockGatewayClient({
    onRequest: ({ params }) => {
      sends.push(params);
      return { ok: true, runId: params.idempotencyKey };
    },
  });
  return {
    runtime: {
      workflowDrivers: {
        async start(params) {
          if (runDriver) setImmediate(() => { void params.run().catch(() => {}); });
        },
      },
      subagent: {
        messages: new Map(),
        async run({ message, sessionKey }) {
          const stepId = message.match(/Step: (\S+)/)?.[1];
          const configuredOutput = typeof workerOutputs[stepId] === 'function' ? workerOutputs[stepId]() : workerOutputs[stepId];
          const output = configuredOutput ?? (stepId === 'research_draft'
            ? { outcome: 'ready_for_attack', research_packet: { summary: ['Research revised.'], scope: { in_scope: [], out_of_scope: [] }, constraints: [], risks: [], open_questions: [], recommendation: 'Approve research.' } }
            : stepId === 'research_attack'
              ? { outcome: 'approved', verdict: validResearchAttackVerdict('Research revised and approved.') }
              : { outcome: workerOutcome });
          this.messages.set(sessionKey, [{ role: 'assistant', content: JSON.stringify(output) }]);
          return { runId: `runtime-${stepId}` };
        },
        async waitForRun() {},
        async getSessionMessages({ sessionKey }) { return { messages: this.messages.get(sessionKey) ?? [] }; },
      },
    },
    orbita: {
      GatewayClient: MockGatewayClient,
      gatewaySettings: { url: 'ws://127.0.0.1:18789', token: 'test-token' },
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

test('Orbita reject continuation delivers next user approval card through text-only relay', async () => {
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
    assert.equal(Object.hasOwn(sends[0], 'attachments'), false);
    assertPublicDeliveryClean(sends[0]);
  });
});

test('Orbita worker question gate delivers card, accepts reply, and resumes to terminal update', async () => {
  await withRoot(async (root) => {
    const sends = [];
    const api = deliveryApi({
      sends,
      workerOutputs: {
        research_draft: {
          outcome: 'needs_input',
          summary: ['Need scope answer.'],
          open_questions: ['Which repo path should be used?'],
        },
        architecture_draft: { outcome: 'ready', summary: ['Answer incorporated.'] },
      },
    });

    const started = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['question reply flow'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
      api,
    });
    assert.equal(started.ok, true);

    await waitFor(() => sends.length === 1);
    const runId = started.workflow_run_id;
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.match(sends[0].message, /Orbita ждёт ответ/);
    assert.match(sends[0].message, /Needed: answer/);
    assert.match(sends[0].message, new RegExp(`/orbita reply ${runId} text`));
    assert.doesNotMatch(sends[0].message, /\/orbita approve |\/orbita reject |approval needed|approve_research|question-answer\.schema\.json|BEGIN_PROMPT|BEGIN_TRANSCRIPT|raw prompt|schema/i);
    assertPublicDeliveryClean(sends[0]);

    const replied = await runOrbita('reply', { _positionals: [runId, 'Use the develop/lib test fixture path.'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
      api,
    });
    assert.equal(replied.ok, true);
    assert.equal(replied.mode, 'reply');
    assert.equal(replied.accepted, true);

    await waitFor(() => sends.length === 2);
    assert.equal(sends[1].key, 'agent:main:requester-a');
    assert.match(sends[1].message, /Orbita workflow update/);
    assert.match(sends[1].message, /done/);
    assert.doesNotMatch(sends[1].message, /requesterBinding|sessionRef|origin|leaseToken|workflow\.json|BEGIN_PROMPT|BEGIN_TRANSCRIPT|raw prompt|schema/i);
    assertPublicDeliveryClean(sends[1]);

    const state = await readWorkflowRunCanonicalState(orbitaPluginConfig(root), runId);
    assert.equal(state.response.status, 'done');
    assert.deepEqual(state.response.baton.state.outputs.ask_scope_question, {
      answer: 'Use the develop/lib test fixture path.',
    });
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


test('Orbita approval delivery preserves system event queue experiment flag through workflow driver', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-driver-system-event`;
    await createSampleWorkflowApprovalRun(root, runId);
    const events = [];
    const heartbeats = [];
    const api = deliveryApi();
    api.runtime.system = {
      enqueueSystemEvent(text, options) {
        events.push({ text, options });
        return true;
      },
      requestHeartbeat(params) {
        heartbeats.push(params);
      },
    };
    api.runtime.sessions = {
      async send() {
        throw new Error('runtime.sessions.send must not be called when system event queue experiment is enabled');
      },
    };

    const ack = await runOrbita('approve', { _positionals: [runId] }, {
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      ctx: { sessionKey: 'agent:main:approver-b' },
      api,
    });

    assert.equal(ack.ok, true);
    await waitFor(() => events.length === 1);
    assert.equal(events[0].options.sessionKey, 'agent:main:requester-a');
    assert.equal(events[0].options.contextKey, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(events[0].options.trusted, true);
    assert.deepEqual(events[0].options.deliveryContext, { channel: 'telegram', to: 'user-a' });
    assert.match(events[0].text, /Orbita workflow update/);
    assert.doesNotMatch(events[0].text, /Internal trusted Orbita relay event|PUBLIC ORBITA CARD|runtime\.sessions\.send|agent:main:requester-a/);
    assert.equal(heartbeats.length, 1);
    assert.deepEqual(heartbeats[0], { source: 'other', intent: 'immediate', sessionKey: 'agent:main:requester-a', reason: 'orbita_workflow_delivery' });
    await waitFor(async () => {
      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      return index.runs[runId].workflowDeliveries?.[0]?.method === 'runtime.system.enqueueSystemEvent';
    });
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.system.enqueueSystemEvent');
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'success');
    assertPublicDeliveryClean(index.runs[runId].workflowDeliveries[0]);
  });
});

test('Orbita approval delivery uses runtime sessions.send by default when experiment flag is absent', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-driver-runtime-send-default`;
    await createSampleWorkflowApprovalRun(root, runId);
    const events = [];
    const sends = [];
    const api = deliveryApi();
    api.runtime.system = {
      enqueueSystemEvent(text, options) {
        events.push({ text, options });
        return true;
      },
      requestHeartbeat() {},
    };
    api.runtime.sessions = {
      async send(params) {
        sends.push(params);
        return { ok: true };
      },
    };

    const ack = await runOrbita('approve', { _positionals: [runId] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'agent:main:approver-b' },
      api,
    });

    assert.equal(ack.ok, true);
    await waitFor(() => sends.length === 1);
    assert.equal(events.length, 0);
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.equal(sends[0].idempotencyKey, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.match(sends[0].message, new RegExp(ORBITA_RELAY_EVENT_TYPE));
    await waitFor(async () => {
      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      return index.runs[runId].workflowDeliveries?.[0]?.method === 'runtime.sessions.send';
    });
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.sessions.send');
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'success');
    assertPublicDeliveryClean(index.runs[runId].workflowDeliveries[0]);
  });
});


test('Orbita background workflow failure delivers one safe failure update to requester session', async () => {
  await withRoot(async (root) => {
    const sends = [];
    const api = deliveryApi({ sends });
    api.runtime.subagent.waitForRun = async () => {
      throw new Error('/Users/sergey/private/worker.log leaseToken=sk-secretsecretsecret requesterBinding sessionRef BEGIN_PROMPT schema raw worker output');
    };

    const result = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['background failure delivery'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
      api,
    });
    assert.equal(result.ok, true);

    await waitFor(() => sends.length === 1);
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.match(sends[0].message, /workflow failed \/ could not continue/i);
    assert.ok(sends[0].message.includes(`run id: \`${result.workflow_run_id}\``));
    assert.match(sends[0].message, new RegExp(`Request ID: ${result.request_id}`));
    assert.match(sends[0].message, /Error: workflow_failed/);
    assert.match(sends[0].message, new RegExp(`/orbita run ${result.workflow_run_id}`));
    assert.doesNotMatch(sends[0].message, /\/Users\/sergey|worker\.log|leaseToken|sk-secret|requesterBinding|sessionRef|BEGIN_PROMPT|schema|raw worker output/i);
    assertPublicDeliveryClean(sends[0]);

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sends.length, 1);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const run = index.runs[result.workflow_run_id];
    assert.equal(run.status, 'failed');
    assert.equal(run.failure.failure_code, 'workflow_failed');
    assert.equal(run.workflowDeliveries.length, 1);
    assert.equal(run.workflowDeliveries[0].marker, `${result.workflow_run_id}:terminal:failed`);
    assert.equal(run.workflowDeliveries[0].status, 'success');
    assertPublicDeliveryClean(run.workflowDeliveries[0]);
  });
});

test('Orbita workflow driver start rejection does not fail quick ack and delivers safe failure', async () => {
  await withRoot(async (root) => {
    const sends = [];
    const api = deliveryApi({ sends, runDriver: false });
    api.runtime.workflowDrivers.start = async () => {
      throw new Error('/Users/sergey/private/driver.log leaseToken=sk-secretsecretsecret requesterBinding sessionRef BEGIN_PROMPT raw driver start');
    };

    const result = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['driver start rejection'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
      api,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    await waitFor(() => sends.length === 1);
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.match(sends[0].message, /workflow failed \/ could not continue/i);
    assert.match(sends[0].message, /Error: workflow_failed/);
    assert.doesNotMatch(sends[0].message, /\/Users\/sergey|driver\.log|leaseToken|sk-secret|requesterBinding|sessionRef|BEGIN_PROMPT|raw driver start/i);
    assertPublicDeliveryClean(sends[0]);

    await waitFor(async () => {
      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      return index.runs[result.workflow_run_id]?.workflowDeliveries?.[0]?.status === 'success';
    });
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    const run = index.runs[result.workflow_run_id];
    assert.equal(run.status, 'failed');
    assert.equal(run.failure.failure_code, 'workflow_failed');
    assert.equal(run.workflowDeliveries[0].marker, `${result.workflow_run_id}:terminal:failed`);
    assert.equal(run.workflowDeliveries[0].status, 'success');
  });
});

test('Orbita failed marking preserves existing terminal success or blocked statuses', async () => {
  await withRoot(async (root) => {
    for (const status of ['done', 'blocked']) {
      const runId = `run-${process.pid}-preserve-${status}`;
      await registerWorkflowRun({
        runsRoot: root,
        runId,
        workflowPath: TEST_SAMPLE_WORKFLOW,
        workflowIdentity: 'sample-workflow',
        title: `sample workflow: ${runId}`,
        status,
        requestId: `orbita-preserve-${status}`,
        requesterBinding: { sessionRef: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a' } },
      });

      await markWorkflowRunFailed({
        runId,
        workflowPath: TEST_SAMPLE_WORKFLOW,
        runsRoot: root,
        failure: { request_id: `orbita-preserve-${status}`, error_code: 'workflow_failed', failure_code: 'workflow_failed', workflow_run_id: runId },
      });

      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      assert.equal(index.runs[runId].status, status);
      assert.equal(Object.hasOwn(index.runs[runId], 'failure'), false);
    }
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


test('Orbita requester delivery uses Gateway sessions.send relay adapter event', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-gateway-adapter`;
    const response = await createRegisteredTerminalRun(root, runId);
    const requests = [];
    const clients = [];
    const MockGatewayClient = makeMockGatewayClient({
      clients,
      onRequest: ({ method, params, options }) => {
        requests.push({ method, params, options });
        return { ok: true, injected: true };
      },
    });
    const api = {
      orbita: {
        GatewayClient: MockGatewayClient,
        gatewaySettings: { url: 'ws://127.0.0.1:18789', token: 'test-token' },
      },
    };

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, true);
    assert.equal(result.method, 'gateway.sessions.send.adapter');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'sessions.send');
    assert.equal(requests[0].params.key, 'agent:main:requester-a');
    assert.equal(requests[0].params.idempotencyKey, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(Object.hasOwn(requests[0].params, 'attachments'), false);
    assert.match(requests[0].params.message, new RegExp(ORBITA_RELAY_EVENT_TYPE));
    assert.match(requests[0].params.message, /Internal trusted Orbita relay event/);
    assert.match(requests[0].params.message, /Instruction for main assistant: relay only the public Orbita card below to Sergey/);
    assert.match(requests[0].params.message, /--- PUBLIC ORBITA CARD ---[\s\S]*Orbita workflow update[\s\S]*done[\s\S]*--- END PUBLIC ORBITA CARD ---/);
    assertPublicDeliveryClean(requests[0].params);
    assert.equal(clients[0].options.clientDisplayName, 'Orbita requester-session relay');
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

test('Orbita persisted pending requester delivery marker is recoverable on re-drive', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-pending-recovers`;
    const response = await createRegisteredTerminalRun(root, runId);
    const indexPath = join(root, 'runs.json');
    const marker = `${runId}:terminal:done`;
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.runs[runId].workflowDeliveries = [{
      marker,
      status: 'pending',
      claimedAt: new Date(Date.now() - 60_000).toISOString(),
      deliveredAt: new Date(Date.now() - 60_000).toISOString(),
      method: '/tmp/orbita/private-session',
      key: 'token=sk-secretsecretsecret',
      reason: 'raw prompt private detail',
    }];
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    const sends = [];
    const api = deliveryApi({ sends });

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, true);
    assert.equal(result.status, 'success');
    assert.equal(result.durable, true);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].idempotencyKey, `orbita-workflow-delivery:${marker}`);
    const updated = JSON.parse(await readFile(indexPath, 'utf8'));
    assert.equal(updated.runs[runId].workflowDeliveries.length, 1);
    assert.equal(updated.runs[runId].workflowDeliveries[0].status, 'success');
    assert.equal(updated.runs[runId].workflowDeliveries[0].marker, marker);
    assertPublicDeliveryClean(updated.runs[runId].workflowDeliveries[0]);
  });
});

test('Orbita requester delivery does not send when durable claim cannot be recorded', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-claim-required`;
    const response = await createRegisteredTerminalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    await chmod(root, 0o555);
    try {
      const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

      assert.equal(result.sent, false);
      assert.equal(result.reason, 'workflow_delivery_claim_failed');
      assert.equal(result.status, 'failed');
      assert.equal(result.durable, false);
      assert.equal(sends.length, 0);
      assertPublicDeliveryClean(result);
    } finally {
      await chmod(root, 0o700);
    }
  });
});

test('Orbita requester delivery reports sent-but-unconfirmed when durable finalize fails', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-finalize-fails`;
    const response = await createRegisteredTerminalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    api.orbita.GatewayClient = class FinalizeFailingGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request(method, params) {
        assert.equal(method, 'sessions.send');
        sends.push(params);
        await chmod(root, 0o555);
        return { ok: true, runId: params.idempotencyKey };
      }
      async stopAndWait() {}
    };

    try {
      const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

      assert.equal(result.sent, true);
      assert.equal(result.status, 'unconfirmed');
      assert.equal(result.reason, 'workflow_delivery_finalize_failed');
      assert.equal(result.durable, false);
      assert.equal(sends.length, 1);
      assertPublicDeliveryClean(result);
    } finally {
      await chmod(root, 0o700);
    }
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'pending');
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
    api.orbita.GatewayClient = class DelayedGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request(method, params) {
        assert.equal(method, 'sessions.send');
        await new Promise((resolve) => setTimeout(resolve, 60));
        sends.push(params);
        return { ok: true, runId: params.idempotencyKey };
      }
      async stopAndWait() {}
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
    api.orbita.GatewayClient = class FailingGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request() { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret'); }
      async stopAndWait() {}
    };

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
    assert.equal(delivery.reason, 'gateway_session_relay_unavailable');
    assert.equal(delivery.method, 'gateway.sessions.send.adapter');
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
    api.orbita.GatewayClient = class FailingGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request() { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret'); }
      async stopAndWait() {}
    };

    const failed = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });
    assert.equal(failed.sent, false);
    assert.equal(failed.status, 'failed');

    api.orbita.GatewayClient = class SuccessfulGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request(method, params) {
        assert.equal(method, 'sessions.send');
        sends.push(params);
        return { ok: true };
      }
      async stopAndWait() {}
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
    api.orbita.GatewayClient = class FailingGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request() { throw new Error('/tmp/orbita/private-session token=sk-secretsecretsecret sessionRef=agent:main:private'); }
      async stopAndWait() {}
    };

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'gateway_session_relay_unavailable');
    assert.equal(result.method, 'gateway.sessions.send.adapter');
    assert.equal(result.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(result.failedAttemptCount, 1);
    assert.equal(Object.hasOwn(result, 'failedAttempts'), false);
    assert.equal(Object.hasOwn(result, 'error'), false);
    assertPublicDeliveryClean(result);
  });
});

test('Orbita requester delivery relay success returns no raw adapter internals', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-return-relay`;
    const response = await createRegisteredTerminalRun(root, runId);
    const api = deliveryApi();
    api.orbita.GatewayClient = class SuccessfulGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request() {
        return { ok: true, localPath: '/Users/sergey/private/result.json', token: 'sk-secretsecretsecret', sessionRef: 'agent:main:private' };
      }
      async stopAndWait() {}
    };

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, true);
    assert.equal(result.status, 'success');
    assert.equal(result.method, 'gateway.sessions.send.adapter');
    assert.equal(result.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(result.attempts, 1);
    assert.equal(result.failedAttemptCount, 0);
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
    index.runs[runId].workflowDeliveries = [{ marker: `${runId}:terminal:done`, deliveredAt: new Date().toISOString(), method: 'gateway.sessions.send.adapter' }];
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

test('Orbita requester delivery failure records only Gateway relay adapter attempt', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-relay-only`;
    await createSampleWorkflowApprovalRun(root, runId);
    const sends = [];
    const api = deliveryApi({ sends });
    api.orbita.GatewayClient = class FailingGatewayClient {
      constructor(options) { this.options = options; }
      start() { setImmediate(() => this.options.onHelloOk?.({ ok: true })); }
      async request() { throw new Error('relay down'); }
      async stopAndWait() {}
    };

    const ack = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'agent:main:approver-b' }, api });
    assert.equal(ack.ok, true);
    await waitFor(async () => {
      const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
      return index.runs[runId].workflowDeliveries?.[0]?.status === 'failed';
    });
    assert.equal(sends.length, 0);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'gateway.sessions.send.adapter');
    assert.equal(index.runs[runId].workflowDeliveries[0].reason, 'gateway_session_relay_unavailable');
  });
});

test('Orbita runtime adapter docs do not claim implemented same-session worker clarification routing', async () => {
  const docsPath = fileURLToPath(new URL('../../docs/workflow-runtime-adapter.md', import.meta.url));
  const docs = await readFile(docsPath, 'utf8');

  assert.match(docs, /does not route same-session worker clarification replies/);
  assert.match(docs, /parses one strict JSON output/);
  assert.doesNotMatch(docs, /allowed same-session continuation/);
});
