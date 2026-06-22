import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'orbita-default-runs-root-'));
process.env.WORKFLOW_RUNS_ROOT = root;

const [{ registerWorkflowRun }, { runOrbita }, { safeArtifactAttachments }] = await Promise.all([
  import('../entrypoints/api/workflowRuns.mjs'),
  import('../entrypoints/orbita/pluginBridge.mjs'),
  import('../entrypoints/orbita/pendingActionCard.mjs'),
]);

const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
});

test('Orbita approve with empty pluginConfig uses the default workflow runs root', async () => {
  const runId = `run-${process.pid}-default-root-control`;
  await registerWorkflowRun({
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    title: 'default root control fallback',
    status: 'done',
    requestId: 'orbita-default-root-control-id',
  });

  const result = await runOrbita('approve', { _positionals: [runId] }, { pluginConfig: {}, ctx: { sessionKey: 'requester-a' }, api: {} });

  assert.equal(result.ok, false);
  assert.equal(result.mode, 'approve');
  assert.equal(result.message, 'workflow_run_not_waiting');
  assert.match(result.text, /not waiting for a pending user action/);
  assert.doesNotMatch(JSON.stringify(result), /ERR_INVALID_ARG_TYPE|path.*undefined/i);
});

test('safeArtifactAttachments with empty pluginConfig uses the default workflow runs root', async () => {
  const runId = `run-${process.pid}-default-root-artifact`;
  const stepId = 'research_draft';
  const artifactDir = join(root, runId, stepId, 'artifacts');
  await mkdir(artifactDir, { recursive: true, mode: 0o700 });
  await writeFile(join(artifactDir, 'research.md'), 'Research packet fixture.', { mode: 0o600 });

  const attachments = await safeArtifactAttachments({}, runId, {
    baton: {
      state: {
        outputs: {
          [stepId]: {
            artifacts: [{
              id: 'research-packet',
              content_type: 'text/markdown',
              path: `${stepId}/artifacts/research.md`,
              summary: 'Research packet',
            }],
          },
        },
      },
    },
  });

  assert.equal(attachments.length, 1);
  assert.deepEqual({ ...attachments[0] }, {
    id: 'research-packet',
    summary: 'Research packet',
    content_type: 'text/markdown',
  });
});
