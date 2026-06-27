import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { ORBITA_RELAY_EVENT_TYPE } from '../entrypoints/orbita/gatewaySessionRelay.mjs';
import { deliverWorkflowResponseToRequester } from '../entrypoints/orbita/workflowAdapter.mjs';

const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));

function orbitaPluginConfig(root) {
  return { workflowRunsRoot: root, workflowPath: TEST_SAMPLE_WORKFLOW };
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-workflow-runtime-session-send-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
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
    requesterBinding: { sessionRef: 'agent:main:requester-a', origin: { channel: 'telegram', sender: 'user-a', account: 'account-a', thread: 'thread-a' } },
  });
  return { runId, status: 'done', requestId: `orbita-${runId}`, baton: { cursor: 'done' }, requests: [] };
}

function assertPublicDeliveryClean(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /requesterBinding|sessionRef|origin|leaseToken|workflow\.json|BEGIN_PROMPT|BEGIN_TRANSCRIPT|raw prompt|schema/i);
  assert.doesNotMatch(text, /\/tmp\/orbita|\/Users\/sergey|research_draft\/artifacts\/research\.md/);
}

test('Orbita requester delivery prefers runtime sessions.send without Gateway settings', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-runtime-sessions-send`;
    const response = await createRegisteredTerminalRun(root, runId);
    const sends = [];
    const api = {
      runtime: {
        sessions: {
          async send(params) {
            sends.push(params);
            return { ok: true, delivered: params.idempotencyKey };
          },
        },
      },
    };

    const result = await deliverWorkflowResponseToRequester({ api, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, true);
    assert.equal(result.method, 'runtime.sessions.send');
    assert.equal(sends.length, 1);
    assert.equal(sends[0].key, 'agent:main:requester-a');
    assert.equal(sends[0].idempotencyKey, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(Object.hasOwn(sends[0], 'attachments'), false);
    assert.match(sends[0].message, new RegExp(ORBITA_RELAY_EVENT_TYPE));
    assert.match(sends[0].message, /Internal trusted Orbita relay event/);
    assert.match(sends[0].message, /--- PUBLIC ORBITA CARD ---[\s\S]*Orbita workflow update[\s\S]*done[\s\S]*--- END PUBLIC ORBITA CARD ---/);
    assertPublicDeliveryClean(sends[0]);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.sessions.send');
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'success');
  });
});

test('Orbita requester delivery uses experimental system event queue when enabled', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-system-event-queue`;
    const response = await createRegisteredTerminalRun(root, runId);
    const events = [];
    const heartbeats = [];
    const api = {
      runtime: {
        system: {
          enqueueSystemEvent(text, options) {
            events.push({ text, options });
            return true;
          },
          requestHeartbeat(params) {
            heartbeats.push(params);
          },
        },
        sessions: {
          async send() {
            throw new Error('sessions.send must not be called for system event queue experiment');
          },
        },
      },
    };

    const result = await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(result.sent, true);
    assert.equal(result.method, 'runtime.system.enqueueSystemEvent');
    assert.equal(events.length, 1);
    assert.equal(events[0].options.sessionKey, 'agent:main:requester-a');
    assert.equal(events[0].options.contextKey, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.equal(events[0].options.trusted, true);
    assert.deepEqual(events[0].options.deliveryContext, { channel: 'telegram', to: 'user-a', accountId: 'account-a', threadId: 'thread-a' });
    assert.match(events[0].text, /Orbita workflow update/);
    assert.doesNotMatch(events[0].text, /Internal trusted Orbita relay event|PUBLIC ORBITA CARD|sessionRef|agent:main:requester-a/);
    assertPublicDeliveryClean(events[0].text);
    assert.equal(heartbeats.length, 1);
    assert.deepEqual(heartbeats[0], { source: 'other', intent: 'immediate', sessionKey: 'agent:main:requester-a', reason: 'orbita_workflow_delivery' });
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.system.enqueueSystemEvent');
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'success');
  });
});

test('Orbita requester delivery treats duplicate system event enqueue as accepted after targeted heartbeat', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-system-event-queue-duplicate`;
    const response = await createRegisteredTerminalRun(root, runId);
    const events = [];
    const heartbeats = [];
    const api = {
      runtime: {
        system: {
          enqueueSystemEvent(text, options) {
            events.push({ text, options });
            return false;
          },
          requestHeartbeat(params) {
            heartbeats.push(params);
            return true;
          },
        },
        sessions: {
          async send() {
            throw new Error('sessions.send must not be called for system event queue experiment');
          },
        },
      },
    };

    const result = await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(result.sent, true);
    assert.equal(result.status, 'success');
    assert.equal(result.method, 'runtime.system.enqueueSystemEvent');
    assert.equal(events.length, 1);
    assert.equal(events[0].options.sessionKey, 'agent:main:requester-a');
    assert.equal(events[0].options.contextKey, `orbita-workflow-delivery:${runId}:terminal:done`);
    assert.match(events[0].text, /Orbita workflow update/);
    assert.doesNotMatch(events[0].text, /Internal trusted Orbita relay event|PUBLIC ORBITA CARD|sessionRef|agent:main:requester-a/);
    assertPublicDeliveryClean(events[0].text);
    assert.equal(heartbeats.length, 1);
    assert.deepEqual(heartbeats[0], { source: 'other', intent: 'immediate', sessionKey: 'agent:main:requester-a', reason: 'orbita_workflow_delivery' });
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries.length, 1);
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'success');
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.system.enqueueSystemEvent');
    assertPublicDeliveryClean(result);
    assertPublicDeliveryClean(index.runs[runId].workflowDeliveries[0]);
  });
});

test('Orbita requester delivery records wake unavailable and allows retry after enqueue', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-system-event-wake-missing`;
    const response = await createRegisteredTerminalRun(root, runId);
    const events = [];
    const api = {
      runtime: {
        system: {
          enqueueSystemEvent(text, options) {
            events.push({ text, options });
            return true;
          },
        },
      },
    };

    const first = await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(first.sent, false);
    assert.equal(first.status, 'failed');
    assert.equal(first.reason, 'system_event_queue_wake_unavailable');
    assert.equal(first.method, 'runtime.system.requestHeartbeat');
    let index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'failed');
    assert.equal(index.runs[runId].workflowDeliveries[0].reason, 'system_event_queue_wake_unavailable');

    api.runtime.system.requestHeartbeat = () => true;
    const second = await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(second.sent, true);
    assert.equal(events.length, 2);
    index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries.length, 1);
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'success');
  });
});

test('Orbita requester delivery records wake failure after enqueue without durable success', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-system-event-wake-throws`;
    const response = await createRegisteredTerminalRun(root, runId);
    const api = {
      runtime: {
        system: {
          enqueueSystemEvent() { return true; },
          requestHeartbeat() { throw new Error('wake transport down with token sk-secretsecretsecret'); },
        },
      },
    };

    const result = await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(result.sent, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'system_event_queue_wake_failed');
    assert.equal(result.method, 'runtime.system.requestHeartbeat');
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'failed');
    assert.equal(index.runs[runId].workflowDeliveries[0].reason, 'system_event_queue_wake_failed');
    assertPublicDeliveryClean(result);
    assertPublicDeliveryClean(index.runs[runId].workflowDeliveries[0]);
  });
});

test('Orbita requester delivery ignores generic workflowDeliveryRelay true for system event queue experiment', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-relay-generic-true`;
    const response = await createRegisteredTerminalRun(root, runId);
    const events = [];
    const sends = [];
    const api = {
      runtime: {
        system: {
          enqueueSystemEvent(text, options) {
            events.push({ text, options });
            return true;
          },
          requestHeartbeat() {},
        },
        sessions: {
          async send(params) {
            sends.push(params);
            return { ok: true };
          },
        },
      },
    };

    const result = await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: { ...orbitaPluginConfig(root), workflowDeliveryRelay: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(result.sent, true);
    assert.equal(result.method, 'runtime.sessions.send');
    assert.equal(events.length, 0);
    assert.equal(sends.length, 1);
  });
});

test('Orbita requester delivery records system event queue unavailable when experiment is enabled without API', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-system-event-missing`;
    const response = await createRegisteredTerminalRun(root, runId);

    const result = await deliverWorkflowResponseToRequester({
      api: { runtime: { sessions: { async send() { throw new Error('sessions.send fallback must not run when system event queue experiment is enabled'); } } } },
      pluginConfig: { ...orbitaPluginConfig(root), experimentalSystemEventQueueDelivery: true },
      runsRoot: root,
      response,
      workflowPath: TEST_SAMPLE_WORKFLOW,
    });

    assert.equal(result.sent, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'system_event_queue_unavailable');
    assert.equal(result.method, 'runtime.system.enqueueSystemEvent');
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'failed');
    assert.equal(index.runs[runId].workflowDeliveries[0].reason, 'system_event_queue_unavailable');
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.system.enqueueSystemEvent');
    assertPublicDeliveryClean(result);
    assertPublicDeliveryClean(index.runs[runId].workflowDeliveries[0]);
  });
});

test('Orbita requester delivery records runtime sessions.send unavailable when no relay API exists', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-delivery-runtime-sessions-missing`;
    const response = await createRegisteredTerminalRun(root, runId);

    const result = await deliverWorkflowResponseToRequester({ api: {}, pluginConfig: orbitaPluginConfig(root), runsRoot: root, response, workflowPath: TEST_SAMPLE_WORKFLOW });

    assert.equal(result.sent, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'runtime_sessions_send_unavailable');
    assert.equal(result.method, 'runtime.sessions.send');
    assert.equal(result.key, `orbita-workflow-delivery:${runId}:terminal:done`);
    const index = JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
    assert.equal(index.runs[runId].workflowDeliveries[0].status, 'failed');
    assert.equal(index.runs[runId].workflowDeliveries[0].reason, 'runtime_sessions_send_unavailable');
    assert.equal(index.runs[runId].workflowDeliveries[0].method, 'runtime.sessions.send');
    assertPublicDeliveryClean(result);
    assertPublicDeliveryClean(index.runs[runId].workflowDeliveries[0]);
  });
});
