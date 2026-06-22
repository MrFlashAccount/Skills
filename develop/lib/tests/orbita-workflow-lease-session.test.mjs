import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { continueRun, next, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import { formatNativeInboxReply, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));

function orbitaPluginConfig(root) {
  return { workflowRunsRoot: root, workflowPath: TEST_SAMPLE_WORKFLOW };
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-workflow-lease-session-'));
  try {
    await fn(root);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

function sessionStoreApi(store = { 'telegram-session': { sessionId: 'telegram-session' } }) {
  return {
    config: { session: { store: 'memory' } },
    runtime: { agent: { session: {
      resolveStorePath() { return 'memory-store'; },
      loadSessionStore() { return store; },
      async updateSessionStoreEntry({ sessionKey, update }) {
        const existing = store[sessionKey];
        if (!existing) return null;
        const patch = await update(existing);
        if (patch) store[sessionKey] = { ...existing, ...patch };
        return store[sessionKey];
      },
    } } },
  };
}

async function mutateRunIndex(root, runId, mutate) {
  const indexPath = join(root, 'runs.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  mutate(index.runs[runId]);
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

async function registerApprovalGateRun(root, suffix, { leaseMs = 60_000 } = {}) {
  const runId = `run-${process.pid}-${suffix}`;
  const registered = await registerWorkflowRun({
    runsRoot: root,
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    title: `sample workflow: ${suffix}`,
    status: 'running',
    requestId: `orbita-${suffix}`,
    claim: true,
    owner: 'main-runner',
    workerId: 'main-runner-worker',
    leaseMs,
  });

  let response = await next({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken, userPrompt: 'lease session test' });
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
        scope: { in_scope: ['lease session'], out_of_scope: [] },
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
    json: JSON.stringify({
      outcome: 'approved',
      verdict: {
        summary: ['Approved.'],
        evidence_checked: ['research_draft output'],
        findings: [{
          category: 'can',
          severity: 'can',
          summary: 'Research packet is consistent.',
          description: 'The research draft output was reviewed and no blocking issue was identified.',
          evidence: [{ ref: 'research_draft output', details: 'Research packet was available for critic review.' }],
          recommendation: 'Proceed to approval.',
        }],
      },
    }),
  });
  response = await continueRun({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken });
  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.requests[0].stepId, 'approve_research');
  return { runId, leaseToken: registered.leaseToken };
}

test('Orbita inbox open-card includes run id only and same-session approve reuses stored lease token', async () => {
  await withRoot(async (root) => {
    const { runId, leaseToken } = await registerApprovalGateRun(root, 'inbox-token-reuse');
    const store = { 'telegram-session': { sessionId: 'telegram-session', pluginExtensions: { orbita: { workflowLeases: { runs: { [runId]: { leaseToken } } } } } } };
    const api = sessionStoreApi(store);
    const ctx = { sessionKey: 'telegram-session', channel: 'telegram' };

    const inbox = await runOrbita('inbox', { limit: '10' }, { pluginConfig: orbitaPluginConfig(root), ctx, api });
    const native = formatNativeInboxReply(inbox);
    assert.equal(inbox.workflow_runs.some((run) => run.workflow_run_id === runId), true);
    assert.match(JSON.stringify(native), new RegExp(`/orbita run ${runId}`));
    assert.doesNotMatch(JSON.stringify(native), /leaseToken|workflowLeases/);
    assert.doesNotMatch(JSON.stringify(native), new RegExp(leaseToken));

    const card = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx, api });
    assert.equal(card.message, 'workflow_run_waiting_for_user');
    assert.equal(store['telegram-session'].pluginExtensions.orbita.workflowLeases.runs[runId].leaseToken, leaseToken);
    assert.doesNotMatch(JSON.stringify(card), new RegExp(leaseToken));

    const approved = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx, api });
    assert.equal(approved.ok, true);
    assert.equal(approved.mode, 'approve');
    assert.doesNotMatch(JSON.stringify(approved), new RegExp(leaseToken));
  });
});

test('Orbita approve without a session token reclaims an expired foreign workflow lease', async () => {
  await withRoot(async (root) => {
    const { runId, leaseToken } = await registerApprovalGateRun(root, 'stale-lease-reclaim');
    await mutateRunIndex(root, runId, (run) => {
      run.workerLease.leaseExpiresAt = new Date(Date.now() - 60_000).toISOString();
    });
    const store = { 'telegram-session': { sessionId: 'telegram-session' } };
    const api = sessionStoreApi(store);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'telegram-session' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'approve');
    const storedLease = store['telegram-session'].pluginExtensions.orbita.workflowLeases.runs[runId].leaseToken;
    assert.equal(typeof storedLease, 'string');
    assert.notEqual(storedLease, leaseToken);
    assert.doesNotMatch(JSON.stringify(result), /leaseToken/);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(storedLease));
  });
});

test('Orbita approve without a session token keeps a fresh foreign workflow lease occupied', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerApprovalGateRun(root, 'fresh-lease-occupied');
    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'telegram-session' }, api: sessionStoreApi() });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'workflow_run_occupied');
    assert.match(result.text, /workflow run is occupied/);
    assert.doesNotMatch(JSON.stringify(result), /leaseToken/);
  });
});
