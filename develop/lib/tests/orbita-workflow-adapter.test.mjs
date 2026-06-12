import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';

import { formatNativeRunText, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

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
    await rm(root, { recursive: true, force: true });
  }
}

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
    assert.equal(result.status, 'needs_host_actions');
    assert.equal(result.approval_step, 'approve_research');
    assert.deepEqual(calls, ['research_draft', 'research_attack']);
    assert.match(result.text, /DevHarness approval required/);
    assert.match(result.text, /approve_research/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.match(result.request_id, /^orbita-/);
    const localPathPattern = new RegExp(`lease-token|Research packet fixture|${sep}private|${sep}tmp|artifact`);
    assert.doesNotMatch(result.text, localPathPattern);
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
    assert.match(result.text, /DevHarness approval required/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.match(result.text, /\[redacted-path\]/);
    assert.match(result.text, /\[redacted-token\]/);
    assert.doesNotMatch(result.text, new RegExp(`Users|sergey|${sep}tmp|abcdefghijklmnopqrstuvwxyz1234567890|ghp_`));
    assert.doesNotMatch(result.text, /prompt|transcript/i);
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


test('Orbita run --workflow reports invalid worker output as human safe error', async () => {
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

    assert.equal(result.ok, false);
    assert.equal(result.error_code, 'runtime_subagent_output_invalid');
    assert.match(result.text, /runtime_subagent_output_invalid/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.doesNotMatch(result.text, /Do private task text|Users|sergey|prompt|private/);
    assert.doesNotMatch(result.text, /^\s*\{/);
  });
});

test('Orbita run --workflow reports waitForRun timeout as human safe error', async () => {
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

    assert.equal(result.ok, false);
    assert.equal(result.error_code, 'runtime_subagent_run_timeout');
    assert.equal(result.request_id, 'orbita-safe-caller-id');
    assert.match(result.text, /runtime_subagent_run_timeout/);
    assert.match(result.text, /Request ID: orbita-safe-caller-id/);
    assert.doesNotMatch(result.text, /raw timeout detail|Users|sergey|private|prompt|private timeout task/);
    assert.doesNotMatch(result.text, /^\s*\{/);
  });
});

test('Orbita run --workflow reports waitForRun error status as human safe error', async () => {
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

    assert.equal(result.ok, false);
    assert.equal(result.error_code, 'runtime_subagent_run_error');
    assert.equal(result.request_id, 'orbita-safe-error-id');
    assert.equal(readMessages, false);
    assert.match(result.text, /runtime_subagent_run_error/);
    assert.match(result.text, /DevHarness worker run failed\./);
    assert.match(result.text, /Request ID: orbita-safe-error-id/);
    assert.doesNotMatch(JSON.stringify(result), /raw error detail|Users|sergey|private|prompt|private error task|privatePath/);
    assert.doesNotMatch(result.text, /^\s*\{/);
  });
});

test('Orbita run --workflow reports missing worker output as human safe error', async () => {
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

    assert.equal(result.ok, false);
    assert.equal(result.error_code, 'runtime_subagent_output_unavailable');
    assert.match(result.text, /runtime_subagent_output_unavailable/);
    assert.match(result.text, /Request ID: orbita-/);
    assert.doesNotMatch(result.text, /^\s*\{/);
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
