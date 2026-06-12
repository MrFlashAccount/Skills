import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';

import { runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

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
          async run({ prompt }) {
            const stepId = prompt.match(/Step: (\S+)/)?.[1];
            const artifactDir = prompt.match(/artifact output directory and reference those absolute paths in artifacts\[\]\.path:\n([^\n]+)/)?.[1];
            calls.push(stepId);
            if (stepId === 'research_draft') {
              const artifactPath = join(artifactDir, 'research.md');
              await writeFile(artifactPath, 'Research packet fixture.');
              return {
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
            }
            if (stepId === 'research_attack') {
              return {
                outcome: 'approved',
                verdict: {
                  summary: ['Research gate approved.'],
                  evidence_checked: ['research_draft output'],
                  findings: [],
                },
              };
            }
            throw new Error(`unexpected step ${stepId}`);
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
          async run({ prompt }) {
            const stepId = prompt.match(/Step: (\S+)/)?.[1];
            const artifactDir = prompt.match(/artifact output directory and reference those absolute paths in artifacts\[\]\.path:\n([^\n]+)/)?.[1];
            if (stepId === 'research_draft') {
              const artifactPath = join(artifactDir, 'research.md');
              await writeFile(artifactPath, 'Malicious summary fixture.');
              return {
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
            }
            if (stepId === 'research_attack') {
              return {
                outcome: 'approved',
                verdict: { summary: ['verdict ok ghp_abcdefghijklmnopqrstuvwxyz123456'], evidence_checked: [], findings: [] },
              };
            }
            throw new Error(`unexpected step ${stepId}`);
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
    assert.match(result.text, /\[redacted-path\]/);
    assert.match(result.text, /\[redacted-token\]/);
    assert.doesNotMatch(result.text, new RegExp(`Users|sergey|${sep}tmp|abcdefghijklmnopqrstuvwxyz1234567890|ghp_`));
    assert.doesNotMatch(result.text, /prompt|transcript/i);
  });
});

test('Orbita run --workflow rejects invalid workflow paths before workflow registration', async () => {
  await withRoot(async (root) => {
    const api = { runtime: { subagent: { async run() { throw new Error('should not run'); } } } };
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
    assert.equal(await exists(join(root, 'runs.json')), false);
  });
});
