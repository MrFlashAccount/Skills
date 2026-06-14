import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';

import { listWorkflowRuns, registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { continueRun, next, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import { formatNativeListText, formatNativeRunText, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

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

async function readLastResponse(root, runId) {
  return JSON.parse(await readFile(join(root, runId, '.workflow-runner', 'last-response.json'), 'utf8'));
}

function approvalGateReached(lastResponse) {
  return lastResponse?.status === 'needs_host_actions'
    && lastResponse.requests?.some((request) => request.action === 'wait_for_approval' && (request.stepId ?? request.id) === 'approve_research');
}

function assertApprovalGateReached(lastResponse) {
  assert.equal(lastResponse.status, 'needs_host_actions');
  const approval = lastResponse.requests?.find((request) => request.action === 'wait_for_approval');
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
    assert.match(native, /request: orbita-list-safe-id/);
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
      workflowPath: join(process.cwd(), 'workflows/dev-harness/workflow.json'),
      workflowIdentity: 'dev-harness',
      status: 'needs_host_actions',
      requestId: 'orbita-unsafe-title-id',
      currentGate: 'approve_research',
    });

    const listed = await runOrbita('list', {}, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' } });

    assert.equal(listed.workflow_runs.length, 1);
    assert.equal(listed.workflow_runs[0].workflow_run_id, registered.runId);
    assert.equal(listed.workflow_runs[0].request_id, 'orbita-unsafe-title-id');
    assert.equal(listed.workflow_runs[0].current_gate, 'approve_research');
    assert.match(listed.workflow_runs[0].title, /^DevHarness: external stored title/);
    assert.ok(listed.workflow_runs[0].title.length <= 96);
    assert.match(listed.workflow_runs[0].title, /\[redacted-/);
    assert.doesNotMatch(JSON.stringify(listed), /Users|sergey|private|prompt|transcript|BEGIN_TRANSCRIPT|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);

    const native = formatNativeListText(listed);
    assert.match(native, /request: orbita-unsafe-title-id/);
    assert.match(native, /gate: approve_research/);
    assert.match(native, /title: DevHarness: external stored title/);
    assert.doesNotMatch(native, /Users|sergey|private|prompt|transcript|BEGIN_TRANSCRIPT|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);
  });
});

test('workflow runner clears stale currentGate after approval continuation leaves gate', async () => {
  await withRoot(async (root) => {
    const workflowPath = join(process.cwd(), 'workflows/dev-harness/workflow.json');
    const runId = `run-${process.pid}-clear-current-gate`;
    const registered = await registerWorkflowRun({
      runsRoot: root,
      runId,
      workflowPath,
      workflowIdentity: 'dev-harness',
      title: 'DevHarness: clear current gate',
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
      json: JSON.stringify({ outcome: 'approved', verdict: { summary: ['Approved.'], evidence_checked: [], findings: [] } }),
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

test('Orbita run --workflow drives DevHarness workers through runner until approve_research', async () => {
  await withRoot(async (root) => {
    const calls = [];
    const api = {
      runtime: {
        subagent: {
          messages: new Map(),
          async run({ message, sessionKey, requestId, idempotencyKey }) {
            assert.match(sessionKey, /^orbita:dev-harness:orbita-/);
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
                  constraints: ['Use the approved DevHarness workflow path only.'],
                  risks: [],
                  open_questions: [],
                  recommendation: 'Approve research.',
                },
                artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
              };
            } else if (stepId === 'research_attack') {
              output = {
                outcome: 'approved',
                verdict: {
                  summary: ['Research gate approved.'],
                  evidence_checked: ['research_draft output'],
                  findings: [],
                },
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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['Implement approved entrypoint-only slice'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.workflow, 'dev-harness');
    assert.equal(result.status, 'running');
    assert.equal(result.approval_step, undefined);
    assert.deepEqual(calls, []);
    assert.match(result.text, /DevHarness started in background/);
    assert.match(result.text, /Workflow run: run-/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.match(result.request_id, /^orbita-/);
    const localPathPattern = new RegExp(`lease-token|Research packet fixture|${sep}private|${sep}tmp|artifact`);
    assert.doesNotMatch(result.text, localPathPattern);

    await waitFor(() => calls.length === 2);
    assert.deepEqual(calls, ['research_draft', 'research_attack']);
    await waitFor(async () => approvalGateReached(await readLastResponse(root, result.workflow_run_id)));
    let run;
    await waitFor(async () => {
      const index = await readRunsIndex(root);
      run = index.runs[result.workflow_run_id];
      return run?.status === 'needs_host_actions' && run?.currentGate === 'approve_research';
    });
    assert.equal(run.status, 'needs_host_actions');
    assert.equal(run.currentGate, 'approve_research');
    // Product-approved exception: the task-derived title is allowed in run lists/status so humans can identify the run.
    assert.equal(run.title, 'DevHarness: Implement approved entrypoint-only slice');
    assertApprovalGateReached(await readLastResponse(root, result.workflow_run_id));

    let listed;
    await waitFor(async () => {
      listed = await runOrbita('list', {}, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' } });
      return listed.workflow_runs.find((workflowRun) => workflowRun.workflow_run_id === result.workflow_run_id)?.current_gate === 'approve_research';
    });
    const listedRun = listed.workflow_runs.find((workflowRun) => workflowRun.workflow_run_id === result.workflow_run_id);
    assert.equal(listedRun.workflow_run_id, result.workflow_run_id);
    assert.equal(listedRun.request_id, result.request_id);
    assert.equal(listedRun.current_gate, 'approve_research');
    const native = formatNativeListText(listed);
    assert.match(native, new RegExp(`request: ${result.request_id}`));
    assert.match(native, /gate: approve_research/);
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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: [maliciousTask],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    const persisted = (await readRunsIndex(root)).runs[result.workflow_run_id];
    const [listed] = await listWorkflowRuns({ runsRoot: root });
    for (const title of [persisted.title, listed.title]) {
      assert.match(title, /^DevHarness: Investigate sanitized run metadata/);
      assert.ok(title.length <= 'DevHarness: '.length + 80);
      assert.match(title, /\[redacted-/);
      assert.doesNotMatch(title, /Users|sergey|private|tmp|prompt|transcript|BEGIN_TRANSCRIPT|lease-token|ghp_|abcdefghijklmnopqrstuvwxyz123456/i);
    }
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
            assert.match(params.label, /^orbita-dev-harness-driver-orbita-/);
            assert.match(params.idempotencyKey, /^orbita-dev-harness-driver:orbita-/);
            assert.equal(params.metadata.openclaw_surface, 'orbita');
            assert.equal(params.metadata.workflow, 'dev-harness');
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
              output = { outcome: 'approved', verdict: { summary: ['Approved.'], evidence_checked: [], findings: [] } };
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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['Use driver lane'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.equal(laneStarts.length, 1);
    assert.deepEqual(calls, []);
    await waitFor(() => calls.length === 2);
    await waitFor(async () => approvalGateReached(await readLastResponse(root, result.workflow_run_id)));
    const index = await readRunsIndex(root);
    assert.equal(index.runs[result.workflow_run_id].status, 'needs_host_actions');
    assertApprovalGateReached(await readLastResponse(root, result.workflow_run_id));
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
                verdict: { summary: ['verdict ok ghp_abcdefghijklmnopqrstuvwxyz123456'], evidence_checked: [], findings: [] },
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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['Handle malicious summary'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.match(result.text, /DevHarness started in background/);
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
    for (const workflow of [join('/', 'tmp', 'workflow.json'), `~${join('/', 'workflow.json')}`, '../workflow.json', 'workflows/research-critic/workflow.json']) {
      const result = await runOrbita('run', { workflow, _positionals: ['task'] }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });
      assert.equal(result.ok, false, workflow);
      assert.equal(result.message, 'unsupported_workflow_path', workflow);
    }
    assert.equal(await exists(join(root, 'runs.json')), false);
  });
});


test('Orbita run --workflow reports missing runtime subagent without registering a run', async () => {
  await withRoot(async (root) => {
    const result = await runOrbita('run', {
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['task'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api: {} });

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
      workflow: 'workflows/dev-harness/workflow.json',
      request_id: unsafeRequestId,
      _positionals: ['task'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api: {} });

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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['Do private task text that must not leak'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.match(result.text, /DevHarness started in background/);
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
      failed_session_key: `orbita:dev-harness:${result.request_id}:${result.workflow_run_id}:research_draft`,
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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['path-like runtime id failure'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

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
      workflow: 'workflows/dev-harness/workflow.json',
      requestId: 'orbita-safe-caller-id',
      _positionals: ['private timeout task'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.equal(result.request_id, 'orbita-safe-caller-id');
    assert.match(result.text, /DevHarness started in background/);
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
      workflow: 'workflows/dev-harness/workflow.json',
      request_id: 'orbita-safe-error-id',
      _positionals: ['private error task'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.equal(result.request_id, 'orbita-safe-error-id');
    assert.match(result.text, /DevHarness started in background/);
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
      workflow: 'workflows/dev-harness/workflow.json',
      _positionals: ['task'],
    }, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' }, api });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'running');
    assert.match(result.text, /DevHarness started in background/);
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

    const listed = await runOrbita('list', {}, { pluginConfig: { workflowRunsRoot: root }, ctx: { sessionKey: 'requester-a' } });
    assert.equal(listed.workflow_runs.length, 1);
    assert.equal(listed.workflow_runs[0].workflow_run_id, result.workflow_run_id);
    assert.equal(listed.workflow_runs[0].request_id, result.request_id);
    assert.equal(listed.workflow_runs[0].status, 'failed');
    assert.equal(listed.workflow_runs[0].failure_code, 'runtime_subagent_output_unavailable');
    assert.equal(listed.workflow_runs[0].error_code, 'runtime_subagent_output_unavailable');
    assert.equal(listed.workflow_runs[0].current_step, 'research_draft');
    assert.equal(listed.workflow_runs[0].task_flow_id, null);
    assert.doesNotMatch(JSON.stringify(listed), /private|\/Users|workflow\.json|runtime-missing|raw error|transcript|prompt/);
  });
});

test('Orbita native run formatting uses safe error text instead of raw JSON', () => {
  const text = formatNativeRunText({
    ok: false,
    mode: 'run',
    workflow: 'dev-harness',
    error_code: 'dev_harness_workflow_failed',
    message: 'dev_harness_workflow_failed',
    request_id: 'orbita-test-request',
    text: '🪐 DevHarness error: dev_harness_workflow_failed\nRequest ID: orbita-test-request',
  });

  assert.equal(text, '🪐 DevHarness error: dev_harness_workflow_failed\nRequest ID: orbita-test-request');
  assert.doesNotMatch(text, /^\s*\{/);
  assert.match(text, /dev_harness_workflow_failed/);
  assert.match(text, /Request ID: orbita-test-request/);
});
