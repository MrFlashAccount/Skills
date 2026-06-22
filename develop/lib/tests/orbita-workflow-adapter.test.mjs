import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listWorkflowRuns, registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { continueRun, next, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import { formatNativeListText, formatNativeRunText, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';
import { readWorkflowRunCanonicalState } from '../entrypoints/orbita/workflowAdapter.mjs';
const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));
const TEST_PARALLEL_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample-workflow-parallel.workflow.json', import.meta.url));
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
function orbitaPluginConfig(root, workflowPath = TEST_SAMPLE_WORKFLOW) {
  return { workflowRunsRoot: root, workflowPath };
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-workflow-adapter-'));
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
async function readRunsIndex(root) {
  return JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
}
async function readRunResponse(root, runId, workflowPath = TEST_SAMPLE_WORKFLOW) {
  return (await readWorkflowRunCanonicalState(orbitaPluginConfig(root, workflowPath), runId)).response;
}

async function writeCanonicalBaton(root, runId, baton) {
  await mkdir(join(root, runId), { recursive: true, mode: 0o700 });
  await writeFile(join(root, runId, 'baton.json'), `${JSON.stringify(baton, null, 2)}\n`, { mode: 0o600 });
}

async function clearWorkerLease(root, runId) {
  const indexPath = join(root, 'runs.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  index.runs[runId].workerLease = null;
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

async function expireWorkerLease(root, runId) {
  const indexPath = join(root, 'runs.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  index.runs[runId].workerLease = {
    ...index.runs[runId].workerLease,
    leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
  };
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function sessionStoreApi(store = { 'requester-a': { sessionId: 'requester-a' } }) {
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

async function createSampleWorkflowApprovalRun(root, runId, { clearLease = true } = {}) {
  const registered = await registerWorkflowRun({
    runsRoot: root,
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    title: 'sample workflow: direct control',
    status: 'running',
    requestId: `orbita-${runId}`,
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
  assertApprovalGateReached(response);
  if (clearLease) await clearWorkerLease(root, runId);
  Object.defineProperty(response, 'leaseToken', { value: registered.leaseToken, enumerable: false });
  return response;
}

function approvalGateReached(response) {
  return response?.status === 'needs_host_actions'
    && response.requests?.some((request) => request.action === 'wait_for_approval' && (request.stepId ?? request.id) === 'approve_research');
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

function assertApprovalGateReached(response) {
  assert.equal(response.status, 'needs_host_actions');
  const approval = response.requests?.find((request) => request.action === 'wait_for_approval');
  assert.ok(approval, 'background continuation must persist a wait_for_approval request');
  assert.equal(approval.stepId ?? approval.id, 'approve_research');
}

test('Orbita list includes registered DevHarness workflow runs with safe metadata', async () => {
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
      workflow: 'workflows/dev-harness/workflow.json',
      requestId: 'orbita-list-safe-id',
      _positionals: ['implement safe list projection for private fixture'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });
    const listed = await runOrbita('list', {}, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' } });

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
    assert.doesNotMatch(native, /workflow\.json|leaseToken|transcript|prompt/);
  });
});

test('Orbita list sanitizes unsafe stored DevHarness workflow titles at projection boundary', async () => {
  await withRoot(async (root) => {
    const unsafePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
    const unsafeTitle = `DevHarness: external stored title ${unsafePath} prompt: ${unsafePath} <<<BEGIN_TRANSCRIPT>>> lease-token=abcdefghijklmnopqrstuvwxyz1234567890 ghp_abcdefghijklmnopqrstuvwxyz123456 and extra text beyond the public title boundary`;
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-unsafe-title`,
      title: unsafeTitle,
      workflowPath: join(REPO_ROOT, 'workflows/dev-harness/workflow.json'),
      workflowIdentity: 'dev-harness',
      status: 'needs_host_actions',
      requestId: 'orbita-unsafe-title-id',
      currentGate: 'approve_research',
    });

    const listed = await runOrbita('list', {}, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' } });

    assert.equal(listed.workflow_runs.length, 1);
    assert.equal(listed.workflow_runs[0].workflow_run_id, registered.runId);
    assert.equal(listed.workflow_runs[0].request_id, 'orbita-unsafe-title-id');
    assert.equal(listed.workflow_runs[0].current_gate, undefined);
    assert.match(listed.workflow_runs[0].title, /^DevHarness: external stored title/);
    assert.ok(listed.workflow_runs[0].title.length <= 96);
    assert.match(listed.workflow_runs[0].title, /\[redacted-/);
    assert.doesNotMatch(JSON.stringify(listed), /Users|sergey|private|prompt|transcript|BEGIN_TRANSCRIPT|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);

    const native = formatNativeListText(listed);
    assert.match(native, /DevHarness: external stored title/);
    assert.doesNotMatch(native, /Users|sergey|private|prompt|transcript|BEGIN_TRANSCRIPT|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);
  });
});

test('Orbita canonical projection fails closed for schema-invalid parseable approval baton', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-invalid-approval-baton`;
    await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      title: 'invalid approval baton must not wait for user',
      status: 'needs_host_actions',
      requestId: 'orbita-invalid-approval-baton-id',
      currentStep: 'approve_research',
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, runId, { cursor: 'approve_research' });

    const state = await readWorkflowRunCanonicalState(orbitaPluginConfig(root), runId);

    assert.equal(state.degradedReason, 'canonical_state_invalid');
    assert.deepEqual(state.hostActions, []);
    assert.equal(state.response, undefined);
    assert.equal(state.currentGate, undefined);
  });
});

test('Orbita canonical projection fails closed for terminal baton with approval cursor', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-terminal-approval-cursor`;
    await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      title: 'terminal approval cursor must not wait for user',
      status: 'done',
      requestId: 'orbita-terminal-approval-cursor-id',
      currentStep: 'approve_research',
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, runId, { cursor: 'approve_research', status: 'done', state: { artifacts: [], results: [] } });

    const state = await readWorkflowRunCanonicalState(orbitaPluginConfig(root), runId);

    assert.equal(state.degradedReason, 'canonical_state_invalid');
    assert.deepEqual(state.hostActions, []);
    assert.equal(state.response, undefined);
    assert.equal(state.currentGate, undefined);
  });
});

test('workflow runner clears stale currentGate after approval continuation leaves gate', async () => {
  await withRoot(async (root) => {
    const workflowPath = TEST_SAMPLE_WORKFLOW;
    const runId = `run-${process.pid}-clear-current-gate`;
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath,
      workflowIdentity: 'sample-workflow',
      title: 'sample workflow: clear current gate',
      status: 'running',
      requestId: 'orbita-clear-gate-id',
      claim: true,
      owner: 'test',
      workerId: 'test-worker',
      leaseMs: 60_000,
    });

    let response = await next({ runId, workflowPath, runsRoot: root, leaseToken: registered.leaseToken, userPrompt: 'clear current gate after approval' });
    assert.equal(response.requests[0].stepId, 'research_draft');
    const artifactDir = join(root, runId, 'research_draft', 'artifacts');
    await mkdir(artifactDir, { recursive: true });
    const artifactPath = join(artifactDir, 'research.md');
    await writeFile(artifactPath, 'Research packet fixture.');
    await writeOutput({
      runId,
      workflowPath,
      runsRoot: root,
      leaseToken: registered.leaseToken,
      stepId: 'research_draft',
      json: JSON.stringify({
        outcome: 'ready_for_attack',
        research_packet: {
          summary: ['Research ready.'],
          scope: { in_scope: ['gate clearing'], out_of_scope: [] },
          constraints: [],
          risks: [],
          open_questions: [],
          recommendation: 'Approve research.',
        },
        artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
      }),
    });

    response = await continueRun({ runId, workflowPath, runsRoot: root, leaseToken: registered.leaseToken });
    assert.equal(response.requests[0].stepId, 'research_attack');
    await writeOutput({
      runId,
      workflowPath,
      runsRoot: root,
      leaseToken: registered.leaseToken,
      stepId: 'research_attack',
      json: JSON.stringify({ outcome: 'approved', verdict: validResearchAttackVerdict() }),
    });

    response = await continueRun({ runId, workflowPath, runsRoot: root, leaseToken: registered.leaseToken });
    assert.equal(response.status, 'needs_host_actions');
    assert.equal(response.requests[0].stepId, 'approve_research');
    let indexed = (await readRunsIndex(root)).runs[runId];
    assert.equal(indexed.currentGate, 'approve_research');

    await writeOutput({
      runId,
      workflowPath,
      runsRoot: root,
      leaseToken: registered.leaseToken,
      stepId: 'approve_research',
      json: JSON.stringify({ approval: 'approved' }),
    });
    response = await continueRun({ runId, workflowPath, runsRoot: root, leaseToken: registered.leaseToken });
    assert.equal(response.status, 'needs_host_actions');
    assert.equal(response.requests[0].action, 'run_worker');
    assert.equal(response.requests[0].stepId, 'architecture_draft');
    indexed = (await readRunsIndex(root)).runs[runId];
    assert.equal(indexed.currentStep, 'architecture_draft');
    assert.equal(Object.hasOwn(indexed, 'currentGate'), false);
  });
});


test('Orbita run --workflow drives sample workflow workers through runner until approve_research', async () => {
  await withRoot(async (root) => {
    const calls = [];
    const api = {
      runtime: {
        subagent: {
          messages: new Map(),
          async run({ message, sessionKey, requestId, idempotencyKey }) {
            assert.match(sessionKey, /^orbita:sample-workflow:orbita-/);
            assert.ok(idempotencyKey.includes(requestId));
            const stepId = message.match(/Step: (\S+)/)?.[1];
            const artifactDir = message.match(/artifact output directory and reference those absolute paths in artifacts\[\]\.path:\n([^\n]+)/)?.[1];
            calls.push(stepId);
            let output;
            if (stepId === 'research_draft') {
              const artifactPath = join(artifactDir, 'research.md');
              await writeFile(artifactPath, 'Research packet fixture.');
              output = {
                outcome: 'ready_for_attack',
                research_packet: {
                  summary: ['Research ready for approval.'],
                  scope: { in_scope: ['entrypoint-only adapter'], out_of_scope: ['generic workflow catalog'] },
                  constraints: ['Use the approved sample workflow path only.'],
                  risks: [],
                  open_questions: [],
                  recommendation: 'Approve research.',
                },
                artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
              };
            } else if (stepId === 'research_attack') {
              output = {
                outcome: 'approved',
                verdict: validResearchAttackVerdict('Research gate approved.'),
              };
            } else {
              throw new Error(`unexpected step ${stepId}`);
            }
            this.messages.set(sessionKey, [{ role: 'assistant', content: JSON.stringify(output) }]);
            return { runId: `runtime-${stepId}` };
          },
          async waitForRun({ runId, timeoutMs }) {
            assert.match(runId, /^runtime-/);
            assert.equal(timeoutMs, 20 * 60 * 1000);
          },
          async getSessionMessages({ sessionKey }) {
            return { messages: this.messages.get(sessionKey) ?? [] };
          },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['Implement approved entrypoint-only slice'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.workflow, 'sample-workflow');
    assert.equal(result.status, 'running');
    assert.equal(result.pending_user_action_step, undefined);
    assert.deepEqual(calls, []);
    assert.match(result.text, /Workflow started in background/);
    assert.match(result.text, /Workflow run: run-/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.match(result.request_id, /^orbita-/);
    const localPathPattern = new RegExp(`lease-token|Research packet fixture|${sep}private|${sep}tmp|artifact`);
    assert.doesNotMatch(result.text, localPathPattern);

    await waitFor(() => calls.length === 2);
    assert.deepEqual(calls, ['research_draft', 'research_attack']);
    await waitFor(async () => approvalGateReached(await readRunResponse(root, result.workflow_run_id)));
    let run;
    await waitFor(async () => {
      const index = await readRunsIndex(root);
      run = index.runs[result.workflow_run_id];
      return run?.status === 'needs_host_actions' && run?.currentGate === 'approve_research';
    });
    assert.equal(run.status, 'needs_host_actions');
    assert.equal(run.currentGate, 'approve_research');
    // Product-approved exception: the task-derived title is allowed in run lists/status so humans can identify the run.
    assert.equal(run.title, 'sample-workflow: Implement approved entrypoint-only slice');
    assertApprovalGateReached(await readRunResponse(root, result.workflow_run_id));

    let listed;
    await waitFor(async () => {
      listed = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
      return listed.workflow_runs.find((workflowRun) => workflowRun.workflow_run_id === result.workflow_run_id)?.user_action_required === true;
    });
    const listedRun = listed.workflow_runs.find((workflowRun) => workflowRun.workflow_run_id === result.workflow_run_id);
    assert.equal(listedRun.workflow_run_id, result.workflow_run_id);
    assert.equal(listedRun.request_id, result.request_id);
    assert.equal(Object.hasOwn(listedRun, 'current_gate'), false);
    assert.equal(Object.hasOwn(listedRun, 'current_step'), false);
    assert.equal(Object.hasOwn(listedRun, 'host_actions'), false);
    assert.equal(listedRun.user_action_required, true);
    const native = formatNativeListText(listed);
    assert.match(native, /waiting for you/);
    assert.doesNotMatch(native, /gate approve_research|approve_research/);
    assert.doesNotMatch(native, /\bcurrent step\b|currentStep|\bcurrent gate\b|currentGate|\baction:/i);
    for (const line of native.split('\n')) {
      const matches = line.match(/[✅🔴⛔🛑🟡❔🔧🔵⚪]/gu) ?? [];
      assert.ok(matches.length <= 1, `line should have at most one status icon: ${line}`);
    }

    const resurfaced = await runOrbita('run', { _positionals: [result.workflow_run_id] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });
    assert.equal(resurfaced.ok, true);
    assert.equal(resurfaced.workflow_run_id, result.workflow_run_id);
    assert.equal(Object.hasOwn(resurfaced, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(resurfaced, 'approval_step'), false);
    assert.equal(Object.hasOwn(resurfaced, 'pending_user_action'), false);
    assert.equal(resurfaced.user_action.type, 'approval');
    assert.equal(resurfaced.user_action.label, 'Approval needed');
    assert.equal(Object.hasOwn(resurfaced.user_action, 'step'), false);
    assert.equal(Object.hasOwn(resurfaced.user_action, 'run_id'), false);
    assert.doesNotMatch(JSON.stringify(resurfaced), /pending_user_action|approve_research|reply_capture_available|natural_reply_supported|requester_ref|OpenClaw plugin API/);
    assert.match(formatNativeRunText(resurfaced), /Orbita ждёт approval/);
    assert.doesNotMatch(formatNativeRunText(resurfaced), /Pending action:|Gate:|approve_research/);
    assert.match(formatNativeRunText(resurfaced), new RegExp(`/orbita approve ${result.workflow_run_id}`));
    assert.match(formatNativeRunText(resurfaced), new RegExp(`/orbita reject ${result.workflow_run_id}`));
    assert.match(formatNativeRunText(resurfaced), new RegExp(`/orbita reply ${result.workflow_run_id}`));
    assert.doesNotMatch(formatNativeRunText(resurfaced), /Test-owned sample workflow approval fixture step|ответь обычным текстом|LGTM|approved\|rejected\|blocked/);
    assert.deepEqual(calls, ['research_draft', 'research_attack']);

    const resurfacedAgain = await runOrbita('run', { _positionals: [result.workflow_run_id] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });
    assert.equal(resurfacedAgain.workflow_run_id, result.workflow_run_id);
    assert.equal(Object.hasOwn(resurfacedAgain, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(resurfacedAgain, 'approval_step'), false);
    assert.equal(Object.hasOwn(resurfacedAgain, 'pending_user_action'), false);
    assert.deepEqual(calls, ['research_draft', 'research_attack']);
  });
});

test('Orbita run <run_id> does not resurface index-only question gates', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-question-gate`;
    await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      title: 'sample workflow: question gate',
      status: 'needs_host_actions',
      requestId: 'orbita-question-gate-id',
      currentGate: 'ask_scope_question',
    });
    const resurfaced = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    assert.equal(resurfaced.ok, true);
    assert.equal(Object.hasOwn(resurfaced, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(resurfaced, 'approval_step'), false);
    assert.equal(Object.hasOwn(resurfaced, 'pending_user_action'), false);
    assert.equal(resurfaced.message, 'workflow_run_invoked_not_waiting');
    assert.equal(Object.hasOwn(resurfaced, 'user_action'), false);
    const native = formatNativeRunText(resurfaced);
    assert.match(native, /не ждёт ответа или approval/);
    assert.doesNotMatch(native, /Pending action:|Gate:|ask_scope_question|\/orbita reply /);
    assert.doesNotMatch(native, /Which repo path and acceptance criteria|question-answer\.schema\.json|approval required|Approval required|approve\/reject/i);
  });
});

test('Orbita approve direct command advances a pending workflow approval', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-direct-approve`;
    await createSampleWorkflowApprovalRun(root, runId);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api: {} });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'approve');
    assert.equal(result.workflow_run_id, runId);
    assert.equal(Object.hasOwn(result, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(result, 'approval_step'), false);
    assert.equal(result.accepted, true);
    assert.match(result.text, /Workflow approved/);
    assert.doesNotMatch(result.text, /Step:|approve_research|research_draft/);
    const response = await readRunResponse(root, runId, TEST_PARALLEL_SAMPLE_WORKFLOW);
    assert.equal(response.status, 'needs_host_actions');
    assert.equal(response.requests[0].stepId, 'architecture_draft');
  });
});

test('Orbita reject and reply direct commands write safe approval outputs', async () => {
  await withRoot(async (root) => {
    const rejectRunId = `run-${process.pid}-direct-reject`;
    await createSampleWorkflowApprovalRun(root, rejectRunId);
    const rejected = await runOrbita('reject', { _positionals: [rejectRunId, 'Needs revision.'] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api: {} });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.mode, 'reject');
    assert.equal(Object.hasOwn(rejected, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(rejected, 'approval_step'), false);
    assert.equal(rejected.accepted, true);
    assert.match(rejected.text, /Workflow rejected/);
    assert.doesNotMatch(rejected.text, /Step:|approve_research|research_draft/);

    const replyRunId = `run-${process.pid}-direct-reply`;
    await createSampleWorkflowApprovalRun(root, replyRunId);
    const replied = await runOrbita('reply', { _positionals: [replyRunId, 'LGTM'] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api: {} });
    assert.equal(replied.ok, true);
    assert.equal(replied.mode, 'reply');
    assert.equal(Object.hasOwn(replied, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(replied, 'approval_step'), false);
    assert.equal(replied.accepted, true);
    assert.match(replied.text, /Workflow answered/);
    assert.doesNotMatch(replied.text, /Step:|approve_research|research_draft/);
  });
});

test('Orbita workflow control claims when current session has no token and stores the returned token locally', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-session-claim-store`;
    await createSampleWorkflowApprovalRun(root, runId);
    const store = { 'requester-a': { sessionId: 'requester-a' } };
    const api = sessionStoreApi(store);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    const lease = store['requester-a'].pluginExtensions?.orbita?.workflowLeases?.runs?.[runId];
    assert.equal(typeof lease?.leaseToken, 'string');
    assert.match(lease.leaseToken, /\S/);
  });
});

test('Orbita workflow control uses current session token before claiming again', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-session-token-first`;
    const prepared = await createSampleWorkflowApprovalRun(root, runId, { clearLease: false });
    const store = { 'requester-a': { sessionId: 'requester-a', pluginExtensions: { orbita: { workflowLeases: { runs: { [runId]: { leaseToken: prepared.leaseToken } } } } } } };
    const api = sessionStoreApi(store);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'approve');
    assert.doesNotMatch(JSON.stringify(result), new RegExp(prepared.leaseToken));
  });
});

test('Orbita workflow control stale session token does not clear another active worker lease', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-stale-session-token-no-release`;
    await createSampleWorkflowApprovalRun(root, runId, { clearLease: false });
    const before = (await readRunsIndex(root)).runs[runId].workerLease;
    const staleToken = 'stale-session-token-that-must-not-release-current-owner';
    const store = { 'requester-a': { sessionId: 'requester-a', pluginExtensions: { orbita: { workflowLeases: { runs: { [runId]: { leaseToken: staleToken } } } } } } };
    const api = sessionStoreApi(store);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'workflow_run_control_failed');
    assert.deepEqual((await readRunsIndex(root)).runs[runId].workerLease, before);
    assert.doesNotMatch(JSON.stringify(result), /stale-session-token|leaseToken/);
  });
});

test('Orbita workflow control correct token release clears only the owned lease after control rejection on non-pending run', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-correct-token-release`;
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      title: 'sample workflow: claimed non-pending',
      status: 'done',
      requestId: 'orbita-correct-token-release-id',
      claim: true,
      leaseMs: 60_000,
    });
    const store = { 'requester-a': { sessionId: 'requester-a', pluginExtensions: { orbita: { workflowLeases: { runs: { [runId]: { leaseToken: registered.leaseToken } } } } } } };
    const api = sessionStoreApi(store);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'workflow_run_not_waiting');
    assert.equal((await readRunsIndex(root)).runs[runId].workerLease, null);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(registered.leaseToken));
  });
});

test('Orbita workflow control store-token failure after claim returns controlled error and releases fresh lease', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-claim-store-fails`;
    await createSampleWorkflowApprovalRun(root, runId);
    const api = sessionStoreApi({ 'requester-a': { sessionId: 'requester-a' } });
    api.runtime.agent.session.updateSessionStoreEntry = async () => { throw new Error('session store write failed with private token context'); };

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'workflow_lease_persistence_failed');
    assert.equal((await readRunsIndex(root)).runs[runId].workerLease, null);
    assert.doesNotMatch(JSON.stringify(result), /leaseToken|private token|session store write failed/);
  });
});

test('Orbita run --workflow store-token failure after registration returns controlled error and releases fresh lease', async () => {
  await withRoot(async (root) => {
    const api = sessionStoreApi({ 'requester-a': { sessionId: 'requester-a' } });
    api.runtime.workflowDrivers = { async start() { assert.fail('workflow driver must not start when lease token persistence fails'); } };
    api.runtime.subagent = { async run() { return { runId: 'runtime-stub' }; }, async waitForRun() {}, async getSessionMessages() { return { messages: [] }; } };
    api.runtime.agent.session.updateSessionStoreEntry = async () => { throw new Error('session store write failed with private token context'); };

    const result = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['Fail token persistence'] }, {
      pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api,
    });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'workflow_lease_persistence_failed');
    const runs = Object.values((await readRunsIndex(root)).runs);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].workerLease, null);
    assert.doesNotMatch(JSON.stringify(result), /leaseToken|private token|session store write failed/);
  });
});

test('Orbita workflow control reclaims stale foreign lease when current session has no token', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-stale-foreign-lease-takeover`;
    await createSampleWorkflowApprovalRun(root, runId, { clearLease: false });
    await expireWorkerLease(root, runId);
    const store = { 'requester-a': { sessionId: 'requester-a' } };
    const api = sessionStoreApi(store);

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'approve');
    assert.notEqual(result.message, 'workflow_run_stale');
    assert.doesNotMatch(JSON.stringify(result), /workflow_run_stale|leaseToken/);
    const lease = store['requester-a'].pluginExtensions?.orbita?.workflowLeases?.runs?.[runId];
    assert.equal(typeof lease?.leaseToken, 'string');
    assert.match(lease.leaseToken, /\S/);
    const response = await readRunResponse(root, runId);
    assert.equal(response.status, 'needs_host_actions');
    assert.equal(response.requests[0].action, 'run_worker');
    assert.equal(response.requests[0].stepId, 'architecture_draft');
  });
});

test('Orbita workflow control returns controlled occupied error when missing session token and core claim is occupied', async () => {
  await withRoot(async (root) => {
    const runId = `run-${process.pid}-session-token-missing-occupied`;
    await createSampleWorkflowApprovalRun(root, runId, { clearLease: false });

    const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api: sessionStoreApi() });

    assert.equal(result.ok, false);
    assert.equal(result.mode, 'approve');
    assert.equal(result.message, 'workflow_run_occupied');
    assert.match(result.text, /workflow run is occupied/);
    assert.doesNotMatch(result.text, /Command failed|Error:/);
    assert.doesNotMatch(JSON.stringify(result), /leaseToken/);
  });
});

test('Orbita run --workflow receives invocation-wide session lease context and stores new run token without leaking tokens', async () => {
  await withRoot(async (root) => {
    const preexistingRunId = `run-${process.pid}-preexisting-token`;
    const store = { 'requester-a': { sessionId: 'requester-a', pluginExtensions: { orbita: { workflowLeases: { runs: { [preexistingRunId]: { leaseToken: 'preexisting-session-token' } } } } } } };
    const api = {
      ...sessionStoreApi(store),
      runtime: {
        ...sessionStoreApi(store).runtime,
        workflowDrivers: { async start() {} },
        subagent: { async run() { return { runId: 'runtime-stub' }; }, async waitForRun() {}, async getSessionMessages() { return { messages: [] }; } },
      },
    };

    const result = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['Attach lease context for non-control run'] }, {
      pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api,
    });

    assert.equal(result.ok, true);
    const leases = store['requester-a'].pluginExtensions.orbita.workflowLeases.runs;
    assert.equal(leases[preexistingRunId].leaseToken, 'preexisting-session-token');
    assert.equal(typeof leases[result.workflow_run_id]?.leaseToken, 'string');
    assert.doesNotMatch(JSON.stringify(result), /leaseToken|preexisting-session-token/);
  });
});

test('Orbita run single missing id tokens return not found without creating lifecycle runs', async () => {
  await withRoot(async (root) => {
    for (const token of ['missingRunId', 'abc123', `unknown-${process.pid}`]) {
      const result = await runOrbita('run', { _positionals: [token] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
      assert.equal(result.ok, false);
      assert.equal(result.mode, 'run');
      assert.equal(result.message, 'workflow_run_not_found');
      assert.equal(result.status, 'unavailable');
      assert.doesNotMatch(JSON.stringify(result), /created_runtime_gap_run|runtime_gap|created/);
    }
    assert.deepEqual(await listWorkflowRuns({ runsRoot: root }), []);
  });
});

test('Orbita workflow control commands return safe errors for invalid or non-pending runs', async () => {
  await withRoot(async (root) => {
    const invalid = await runOrbita('approve', { _positionals: ['../bad-run'] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.mode, 'approve');
    assert.equal(invalid.message, 'workflow_run_control_unavailable');
    assert.match(invalid.text, /workflow run id is invalid or unavailable/);
    assert.doesNotMatch(JSON.stringify(invalid), /invalid workflow runId|\.\.\/bad-run/);

    const terminalRunId = `run-${process.pid}-direct-terminal`;
    await registerWorkflowRun({
      runsRoot: root,
      runId: terminalRunId,
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      title: 'sample workflow: terminal',
      status: 'done',
      requestId: 'orbita-terminal-id',
    });
    const terminal = await runOrbita('approve', { _positionals: [terminalRunId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    assert.equal(terminal.ok, false);
    assert.equal(terminal.mode, 'approve');
    assert.equal(terminal.message, 'workflow_run_not_waiting');
    assert.match(terminal.text, /not waiting for a pending user action/);
  });
});

test('Orbita run --workflow executes parallel run_worker requests before continuing to join', async () => {
  await withRoot(async (root) => {
    const calls = [];
    const started = new Set();
    const messages = new Map();
    const api = { runtime: { subagent: {
      async run({ message, sessionKey }) {
        const stepId = message.match(/Step: (\S+)/)?.[1];
        calls.push(stepId);
        started.add(stepId);
        messages.set(sessionKey, [{ role: 'assistant', content: JSON.stringify({ outcome: 'ready' }) }]);
        return { runId: `runtime-${stepId}` };
      },
      async waitForRun({ runId }) {
        if (runId === 'runtime-branch_a') assert.equal(started.has('branch_b'), true, 'branch_b should start before branch_a wait resolves');
      },
      async getSessionMessages({ sessionKey }) { return { messages: messages.get(sessionKey) ?? [] }; },
    } } };
    const result = await runOrbita('run', { workflow: 'workflows/sample-workflow/workflow.json', _positionals: ['Exercise parallel fan-out'] }, {
      pluginConfig: orbitaPluginConfig(root, TEST_PARALLEL_SAMPLE_WORKFLOW), ctx: { sessionKey: 'requester-a' }, api,
    });
    assert.equal(result.ok, true);
    await waitFor(() => calls.length === 4, { timeoutMs: 10_000 });
    assert.deepEqual(calls, ['prepare', 'branch_a', 'branch_b', 'join']);
    await waitFor(async () => approvalGateReached(await readRunResponse(root, result.workflow_run_id)));
    const response = await readRunResponse(root, result.workflow_run_id);
    assertApprovalGateReached(response);
    assert.equal(response.baton.cursor, 'approve_research');
    assert.equal(response.baton.state.branch_a.outcome, 'ready');
    assert.equal(response.baton.state.branch_b.outcome, 'ready');
    assert.equal(response.baton.state.join.outcome, 'ready');
  });
});

test('Orbita run --workflow persists sanitized useful task-derived run title', async () => {
  await withRoot(async (root) => {
    const unsafePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
    const unsafeTranscript = join('/', 'tmp', 'orbita', 'transcript.log');
    const maliciousTask = `Investigate sanitized run metadata ${unsafePath} prompt: ${unsafePath} <<<BEGIN_TRANSCRIPT>>> ${unsafeTranscript} lease-token=abcdefghijklmnopqrstuvwxyz1234567890 ghp_abcdefghijklmnopqrstuvwxyz123456`;
    const api = {
      runtime: {
        subagent: {
          async run() { return { runId: 'runtime-stub' }; },
          async waitForRun() {},
          async getSessionMessages() { return { messages: [] }; },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: [maliciousTask],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    const persisted = (await readRunsIndex(root)).runs[result.workflow_run_id];
    const [listed] = await listWorkflowRuns({ runsRoot: root });
    for (const title of [persisted.title, listed.title]) {
      assert.match(title, /^sample-workflow: Investigate sanitized run metadata/);
      assert.ok(title.length <= 'sample workflow: '.length + 80);
      assert.match(title, /\[redacted-/);
      assert.doesNotMatch(title, /Users|sergey|private|tmp|prompt|transcript|BEGIN_TRANSCRIPT|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);
    }
  });
});

test('Orbita run --workflow persists command session origin binding privately without exposing it to driver metadata', async () => {
  await withRoot(async (root) => {
    const laneStarts = [];
    const api = {
      runtime: {
        workflowDrivers: { async start(params) { laneStarts.push(params); } },
        subagent: { async run() { return { runId: 'runtime-stub' }; }, async waitForRun() {}, async getSessionMessages() { return { messages: [] }; } },
      },
    };
    const ctx = {
      sessionKey: 'agent:main:session-command',
      channel: 'telegram',
      accountId: 'acct-command',
      from: { id: 'user-command' },
      to: { id: 'bot-command' },
      messageThreadId: 'thread-command',
      threadParentId: 'parent-command',
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['Bind command origin'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx, api });

    assert.equal(result.ok, true);
    assert.equal(laneStarts.length, 1);
    const expectedBinding = {
      sessionRef: 'agent:main:session-command',
      origin: {
        channel: 'telegram',
        account: 'acct-command',
        sender: 'user-command',
        recipient: 'bot-command',
        thread: 'thread-command',
        parentThread: 'parent-command',
      },
    };
    const privateRun = (await readRunsIndex(root)).runs[result.workflow_run_id];
    assert.deepEqual(privateRun.requesterBinding, expectedBinding);
    assert.equal(laneStarts[0].metadata.requesterDelivery, 'bound');
    assert.equal(Object.hasOwn(laneStarts[0].metadata, 'requesterBinding'), false);

    const [listed] = await listWorkflowRuns({ runsRoot: root });
    assert.equal(Object.hasOwn(listed, 'requesterBinding'), false);
    const bridgeList = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx, api });
    const bridgeStatus = await runOrbita('status', { run: result.workflow_run_id }, { pluginConfig: orbitaPluginConfig(root), ctx, api });
    for (const publicValue of [listed, bridgeList, bridgeStatus]) {
      assert.doesNotMatch(JSON.stringify(publicValue), /"requesterBinding"|"sessionRef"|"origin"|agent:main:session-command|user-command|bot-command|thread-command|parent-command|acct-command/);
    }
  });
});

test('Orbita run --workflow persists tool delivery context binding privately', async () => {
  await withRoot(async (root) => {
    const laneStarts = [];
    const api = {
      runtime: {
        workflowDrivers: { async start(params) { laneStarts.push(params); } },
        subagent: { async run() { return { runId: 'runtime-stub' }; }, async waitForRun() {}, async getSessionMessages() { return { messages: [] }; } },
      },
    };
    const ctx = {
      sessionKey: 'agent:tool:session-delivery',
      deliveryContext: {
        channel: 'telegram',
        accountId: 'acct-tool',
        from: { id: 'user-tool' },
        to: { id: 'bot-tool' },
        messageThreadId: 'thread-tool',
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['Bind tool origin'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx, api });

    assert.equal(result.ok, true);
    const expectedBinding = {
      sessionRef: 'agent:tool:session-delivery',
      origin: {
        channel: 'telegram',
        account: 'acct-tool',
        sender: 'user-tool',
        recipient: 'bot-tool',
        thread: 'thread-tool',
      },
    };
    const privateRun = (await readRunsIndex(root)).runs[result.workflow_run_id];
    assert.deepEqual(privateRun.requesterBinding, expectedBinding);
    assert.equal(laneStarts[0].metadata.requesterDelivery, 'bound');
    assert.equal(Object.hasOwn(laneStarts[0].metadata, 'requesterBinding'), false);

    const [listed] = await listWorkflowRuns({ runsRoot: root });
    assert.equal(Object.hasOwn(listed, 'requesterBinding'), false);
    assert.doesNotMatch(JSON.stringify(await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx, api })), /"requesterBinding"|"sessionRef"|"origin"|agent:tool:session-delivery|user-tool|bot-tool|thread-tool|acct-tool/);
  });
});

test('Orbita run --workflow uses runtime workflow driver lane when available', async () => {
  await withRoot(async (root) => {
    const calls = [];
    const laneStarts = [];
    const api = {
      runtime: {
        workflowDrivers: {
          async start(params) {
            assert.match(params.label, /^orbita-sample-workflow-driver-orbita-/);
            assert.match(params.idempotencyKey, /^orbita-sample-workflow-driver:orbita-/);
            assert.equal(params.metadata.openclaw_surface, 'orbita');
            assert.equal(params.metadata.workflow, 'sample-workflow');
            assert.equal(typeof params.run, 'function');
            laneStarts.push(params);
            setTimeout(() => { void params.run().catch(() => {}); }, 0);
          },
        },
        subagent: {
          messages: new Map(),
          async run({ message, sessionKey }) {
            const stepId = message.match(/Step: (\S+)/)?.[1];
            const artifactDir = message.match(/artifact output directory and reference those absolute paths in artifacts\[\]\.path:\n([^\n]+)/)?.[1];
            calls.push(stepId);
            let output;
            if (stepId === 'research_draft') {
              const artifactPath = join(artifactDir, 'research.md');
              await writeFile(artifactPath, 'Research packet fixture.');
              output = {
                outcome: 'ready_for_attack',
                research_packet: {
                  summary: ['Research ready.'],
                  scope: { in_scope: ['adapter'], out_of_scope: [] },
                  constraints: [],
                  risks: [],
                  open_questions: [],
                  recommendation: 'Approve research.',
                },
                artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
              };
            } else if (stepId === 'research_attack') {
              output = { outcome: 'approved', verdict: validResearchAttackVerdict() };
            } else {
              throw new Error(`unexpected step ${stepId}`);
            }
            this.messages.set(sessionKey, [{ role: 'assistant', content: JSON.stringify(output) }]);
            return { runId: `runtime-${stepId}` };
          },
          async waitForRun() {},
          async getSessionMessages({ sessionKey }) {
            return { messages: this.messages.get(sessionKey) ?? [] };
          },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['Use driver lane'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.equal(laneStarts.length, 1);
    assert.deepEqual(calls, []);
    await waitFor(() => calls.length === 2);
    await waitFor(async () => approvalGateReached(await readRunResponse(root, result.workflow_run_id)));
    const index = await readRunsIndex(root);
    assert.equal(index.runs[result.workflow_run_id].status, 'needs_host_actions');
    assertApprovalGateReached(await readRunResponse(root, result.workflow_run_id));
  });
});

test('Orbita run --workflow shapes malicious worker summaries before approval projection', async () => {
  await withRoot(async (root) => {
    const fakeHomePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
    const fakeTempPath = join('/', 'tmp', 'orbita', 'transcript.log');
    const api = {
      runtime: {
        subagent: {
          messages: new Map(),
          async run({ message, sessionKey }) {
            const stepId = message.match(/Step: (\S+)/)?.[1];
            const artifactDir = message.match(/artifact output directory and reference those absolute paths in artifacts\[\]\.path:\n([^\n]+)/)?.[1];
            let output;
            if (stepId === 'research_draft') {
              const artifactPath = join(artifactDir, 'research.md');
              await writeFile(artifactPath, 'Malicious summary fixture.');
              output = {
                outcome: 'ready_for_attack',
                research_packet: {
                  summary: [
                    `prompt: ${fakeHomePath} lease-token=abcdefghijklmnopqrstuvwxyz1234567890 transcript: ${fakeTempPath}`,
                    `See ${fakeHomePath} for details`,
                  ],
                  scope: { in_scope: [], out_of_scope: [] },
                  constraints: [],
                  risks: [],
                  open_questions: [],
                  recommendation: 'Approve research.',
                },
                artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
              };
            } else if (stepId === 'research_attack') {
              output = {
                outcome: 'approved',
                verdict: validResearchAttackVerdict('verdict ok ghp_abcdefghijklmnopqrstuvwxyz123456'),
              };
            } else {
              throw new Error(`unexpected step ${stepId}`);
            }
            this.messages.set(sessionKey, [{ role: 'assistant', content: JSON.stringify(output) }]);
            return { runId: `runtime-${stepId}` };
          },
          async waitForRun() {},
          async getSessionMessages({ sessionKey }) {
            return { messages: this.messages.get(sessionKey) ?? [] };
          },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['Handle malicious summary'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.match(result.text, /Workflow started in background/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.doesNotMatch(result.text, new RegExp(`Users|sergey|${sep}tmp|abcdefghijklmnopqrstuvwxyz1234567890|ghp_`));
    assert.doesNotMatch(result.text, /prompt|transcript/i);

    await waitFor(async () => {
      const index = await readRunsIndex(root);
      return index.runs[result.workflow_run_id]?.status === 'needs_host_actions';
    });
  });
});

test('Orbita run --workflow rejects invalid workflow paths before workflow registration', async () => {
  await withRoot(async (root) => {
    const api = { runtime: { subagent: { async run() { throw new Error('should not run'); }, async waitForRun() {}, async getSessionMessages() { return []; } } } };
    for (const workflow of [join('/', 'tmp', 'workflow.json'), `~${join('/', 'workflow.json')}`, '../workflow.json']) {
      const result = await runOrbita('run', { workflow, _positionals: ['task'] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });
      assert.equal(result.ok, false, workflow);
      assert.equal(result.message, 'unsupported_workflow_path', workflow);
    }
    assert.equal(await exists(join(root, 'runs.json')), false);
  });
});


test('Orbita run --workflow reports missing runtime subagent without registering a run', async () => {
  await withRoot(async (root) => {
    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['task'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api: {} });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'runtime_subagent_unavailable');
    assert.match(result.text, /runtime_subagent_unavailable/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.doesNotMatch(result.text, /^\s*\{/);
    assert.equal(await exists(join(root, 'runs.json')), false);
  });
});


test('Orbita run --workflow regenerates unsafe caller supplied request_id before public output', async () => {
  await withRoot(async (root) => {
    const unsafePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
    const unsafeRequestId = `USER-${unsafePath}-ghp_abcdefghijklmnopqrstuvwxyz123456`;
    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      request_id: unsafeRequestId,
      _positionals: ['task'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api: {} });

    assert.equal(result.ok, false);
    assert.equal(result.error_code, 'runtime_subagent_unavailable');
    assert.match(result.request_id, /^orbita-[0-9a-f-]{36}$/);
    assert.match(result.text, new RegExp(`Request ID: ${result.request_id}`));
    assert.doesNotMatch(JSON.stringify(result), /USER-|Users|sergey|private|prompt|ghp_|abcdefghijklmnopqrstuvwxyz123456/);
    assert.equal(await exists(join(root, 'runs.json')), false);
  });
});


test('Orbita run --workflow returns ack then records invalid worker output failure in background', async () => {
  await withRoot(async (root) => {
    const privatePrompt = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
    const api = {
      runtime: {
        subagent: {
          async run({ sessionKey }) {
            this.sessionKey = sessionKey;
            return { runId: 'runtime-invalid' };
          },
          async waitForRun() {},
          async getSessionMessages() {
            return { messages: [{ role: 'assistant', content: `{ "not": "json", "path": "${privatePrompt}"` }] };
          },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['Do private task text that must not leak'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.match(result.text, /Workflow started in background/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.doesNotMatch(result.text, /Do private task text|Users|sergey|prompt|private/);
    assert.doesNotMatch(result.text, /^\s*\{/);

    await waitFor(async () => {
      const index = await readRunsIndex(root);
      return index.runs[result.workflow_run_id]?.status === 'failed';
    });
    const failure = (await readRunsIndex(root)).runs[result.workflow_run_id].failure;
    assert.deepEqual(failure, {
      request_id: result.request_id,
      error_code: 'runtime_subagent_output_invalid',
      failure_code: 'runtime_subagent_output_invalid',
      workflow_run_id: result.workflow_run_id,
      failed_step_id: 'research_draft',
      failed_session_key: `orbita:sample-workflow:${result.request_id}:${result.workflow_run_id}:research_draft`,
      runtime_run_id: 'runtime-invalid',
    });
    assert.doesNotMatch(JSON.stringify(failure), /Do private task text|Users|sergey|prompt|private/);
  });
});

test('Orbita run --workflow redacts path-like runtime run id before failure persistence and listing', async () => {
  await withRoot(async (root) => {
    const pathLikeRuntimeId = join('/', 'tmp', 'orbita', 'runtime-run-id');
    const api = {
      runtime: {
        subagent: {
          async run() { return { runId: pathLikeRuntimeId }; },
          async waitForRun() {},
          async getSessionMessages() { return { messages: [{ role: 'assistant', content: '{ not-json' }] }; },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['path-like runtime id failure'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    await waitFor(async () => {
      const index = await readRunsIndex(root);
      return index.runs[result.workflow_run_id]?.status === 'failed';
    });
    const persistedFailure = (await readRunsIndex(root)).runs[result.workflow_run_id].failure;
    const [listed] = await listWorkflowRuns({ runsRoot: root });
    assert.equal(persistedFailure.runtime_run_id, '[redacted]');
    assert.equal(listed.failure.runtime_run_id, '[redacted]');
    assert.doesNotMatch(JSON.stringify([persistedFailure, listed.failure]), /\/tmp|orbita\/runtime-run-id|runtime-run-id/);
  });
});

test('Orbita run --workflow returns ack then records waitForRun timeout failure in background', async () => {
  await withRoot(async (root) => {
    const api = {
      runtime: {
        subagent: {
          async run() { return { runId: 'runtime-timeout' }; },
          async waitForRun({ runId, timeoutMs }) {
            assert.equal(runId, 'runtime-timeout');
            assert.equal(timeoutMs, 20 * 60 * 1000);
            const privatePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
            return { status: 'timeout', message: `raw timeout detail ${privatePath}` };
          },
          async getSessionMessages() { throw new Error('should not read messages after timeout'); },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      requestId: 'orbita-safe-caller-id',
      _positionals: ['private timeout task'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.equal(result.request_id, 'orbita-safe-caller-id');
    assert.match(result.text, /Workflow started in background/);
    assert.match(result.text, /Request ID: orbita-safe-caller-id/);
    assert.doesNotMatch(result.text, /raw timeout detail|Users|sergey|private|prompt|private timeout task/);
    assert.doesNotMatch(result.text, /^\s*\{/);

    await waitFor(async () => {
      const index = await readRunsIndex(root);
      return index.runs[result.workflow_run_id]?.status === 'failed';
    });
    const failure = (await readRunsIndex(root)).runs[result.workflow_run_id].failure;
    assert.equal(failure.request_id, 'orbita-safe-caller-id');
    assert.equal(failure.error_code, 'runtime_subagent_run_timeout');
    assert.equal(failure.failure_code, 'runtime_subagent_run_timeout');
    assert.equal(failure.failed_step_id, 'research_draft');
    assert.equal(failure.runtime_run_id, 'runtime-timeout');
    assert.doesNotMatch(JSON.stringify(failure), /raw timeout detail|Users|sergey|private|prompt|private timeout task/);
  });
});

test('Orbita run --workflow returns ack then records waitForRun error status failure in background', async () => {
  await withRoot(async (root) => {
    let readMessages = false;
    const api = {
      runtime: {
        subagent: {
          async run() { return { runId: 'runtime-error' }; },
          async waitForRun() {
            const privatePath = join('/', 'Users', 'sergey', 'private', 'prompt.txt');
            return { status: 'error', message: `raw error detail ${privatePath}`, raw: { privatePath } };
          },
          async getSessionMessages() {
            readMessages = true;
            throw new Error('should not read messages after waitForRun error');
          },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      request_id: 'orbita-safe-error-id',
      _positionals: ['private error task'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.equal(result.request_id, 'orbita-safe-error-id');
    assert.match(result.text, /Workflow started in background/);
    assert.match(result.text, /Request ID: orbita-safe-error-id/);
    assert.doesNotMatch(JSON.stringify(result), /raw error detail|Users|sergey|private|prompt|private error task|privatePath/);
    assert.doesNotMatch(result.text, /^\s*\{/);

    await waitFor(async () => {
      const index = await readRunsIndex(root);
      return index.runs[result.workflow_run_id]?.status === 'failed';
    });
    const failure = (await readRunsIndex(root)).runs[result.workflow_run_id].failure;
    assert.equal(failure.request_id, 'orbita-safe-error-id');
    assert.equal(failure.error_code, 'runtime_subagent_run_error');
    assert.equal(failure.failure_code, 'runtime_subagent_run_error');
    assert.equal(failure.failed_step_id, 'research_draft');
    assert.equal(failure.runtime_run_id, 'runtime-error');
    assert.doesNotMatch(JSON.stringify(failure), /raw error detail|Users|sergey|private|prompt|private error task|privatePath/);
    assert.equal(readMessages, false);
  });
});

test('Orbita run --workflow returns ack then records missing worker output failure in background', async () => {
  await withRoot(async (root) => {
    const api = {
      runtime: {
        subagent: {
          async run() { return { runId: 'runtime-missing' }; },
          async waitForRun() {},
          async getSessionMessages() { return { messages: [] }; },
        },
      },
    };

    const result = await runOrbita('run', {
      workflow: 'workflows/sample-workflow/workflow.json',
      _positionals: ['task'],
    }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.match(result.text, /Workflow started in background/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.doesNotMatch(result.text, /^\s*\{/);

    await waitFor(async () => {
      const index = await readRunsIndex(root);
      return index.runs[result.workflow_run_id]?.status === 'failed';
    });
    const failure = (await readRunsIndex(root)).runs[result.workflow_run_id].failure;
    assert.equal(failure.request_id, result.request_id);
    assert.equal(failure.error_code, 'runtime_subagent_output_unavailable');
    assert.equal(failure.failure_code, 'runtime_subagent_output_unavailable');
    assert.equal(failure.failed_step_id, 'research_draft');
    assert.equal(failure.runtime_run_id, 'runtime-missing');

    const listed = await runOrbita('list', {}, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    assert.equal(listed.workflow_runs.length, 1);
    assert.equal(listed.workflow_runs[0].workflow_run_id, result.workflow_run_id);
    assert.equal(listed.workflow_runs[0].request_id, result.request_id);
    assert.equal(listed.workflow_runs[0].status, 'failed');
    assert.equal(listed.workflow_runs[0].failure_code, 'runtime_subagent_output_unavailable');
    assert.equal(listed.workflow_runs[0].error_code, 'runtime_subagent_output_unavailable');
    assert.equal(Object.hasOwn(listed.workflow_runs[0], 'current_step'), false);
    assert.equal(listed.workflow_runs[0].task_flow_id, null);
    assert.doesNotMatch(JSON.stringify(listed), /private|\/Users|workflow\.json|runtime-missing|raw error|transcript|prompt/);
  });
});

test('Orbita native run formatting uses safe error text instead of raw JSON', () => {
  const text = formatNativeRunText({
    ok: false,
    mode: 'run',
    workflow: 'sample-workflow',
    error_code: 'dev_harness_workflow_failed',
    message: 'dev_harness_workflow_failed',
    request_id: 'orbita-test-request',
    text: '🪐 sample workflow error: dev_harness_workflow_failed\nRequest ID: orbita-test-request',
  });

  assert.equal(text, '🪐 sample workflow error: dev_harness_workflow_failed\nRequest ID: orbita-test-request');
  assert.doesNotMatch(text, /^\s*\{/);
  assert.match(text, /dev_harness_workflow_failed/);
  assert.match(text, /Request ID: orbita-test-request/);
});
