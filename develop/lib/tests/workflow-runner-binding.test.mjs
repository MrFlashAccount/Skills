import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { continueRun, next as runnerNext, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import { claimWorkflowRun, registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { assertIsolatedWorkflowRunsRoot } from './helpers/workflow-runs-root.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-binding-'));
const runsRoot = assertIsolatedWorkflowRunsRoot(path.join(tempDir, '.workflow-runs'));
process.env.WORKFLOW_RUNS_ROOT = runsRoot;

after(() => rmSync(tempDir, { recursive: true, force: true }));

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function workflowDoc(name, prompt = 'Prepare branch.') {
  return {
    name,
    version: 1,
    start: 'prepare',
    done: 'done',
    blocked: 'blocked',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { prompt },
        output: { template: 'output.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };
}


function workflowPath(label, prompt) {
  const filePath = path.join(tempDir, `${label}.json`);
  writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeJson(filePath, workflowDoc(label, prompt));
  return filePath;
}

test('runner binding: existing runId cannot be rebound by next or continue workflow args', async () => {
  const runId = `binding-${process.pid}-runner-api`;
  const firstWorkflow = workflowPath('runner-api-first', 'first');
  const secondWorkflow = workflowPath('runner-api-second', 'second');
  const registered = await registerWorkflowRun({ runId, workflowPath: firstWorkflow, runsRoot, claim: true });
  const leaseToken = registered.leaseToken;

  const first = await runnerNext({ runId, workflowPath: firstWorkflow, runsRoot, leaseToken });
  assert.equal(first.status, 'needs_host_actions');

  await assert.rejects(
    runnerNext({ runId, workflowPath: secondWorkflow, runsRoot, leaseToken }),
    /already bound to a different workflow/,
  );
  await writeOutput({ runId, workflowPath: firstWorkflow, runsRoot, stepId: 'prepare', json: JSON.stringify({ outcome: 'Worker output.' }), leaseToken });
  await assert.rejects(
    continueRun({ runId, workflowPath: secondWorkflow, runsRoot, leaseToken }),
    /already bound to a different workflow/,
  );
});

test('runner binding: lease write surfaces cannot rebind an existing runId', async () => {
  const runId = `binding-${process.pid}-lease-api`;
  const firstWorkflow = workflowPath('lease-api-first', 'first');
  const secondWorkflow = workflowPath('lease-api-second', 'second');
  const registered = await registerWorkflowRun({ runId, workflowPath: firstWorkflow, runsRoot, claim: true });

  await assert.rejects(
    claimWorkflowRun({ runId, workflowPath: secondWorkflow, runsRoot, leaseToken: registered.leaseToken }),
    /already bound to a different workflow/,
  );
});

test('runner binding: runId alone resumes the indexed workflow without legacy last-response path fallback', async () => {
  const runId = `binding-${process.pid}-runid-only`;
  const firstWorkflow = workflowPath('runid-only-first', 'first');
  const registered = await registerWorkflowRun({ runId, workflowPath: firstWorkflow, runsRoot, claim: true });

  const first = await runnerNext({ runId, workflowPath: firstWorkflow, runsRoot, leaseToken: registered.leaseToken });
  assert.equal(first.status, 'needs_host_actions');

  const resumed = await runnerNext({ runId, runsRoot, leaseToken: registered.leaseToken });
  assert.equal(resumed.status, 'needs_host_actions');
});
