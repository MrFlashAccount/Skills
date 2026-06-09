import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  cancelWorkflowGatekeeper,
  gateWorkflow,
  listWorkflowGatekeepers,
  resumeWorkflowGatekeeper,
  startWorkflowGatekeeper,
  statusWorkflowGatekeeper,
} from '../entrypoints/api/workflowGatekeeper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-gatekeeper-'));
const runsRoot = path.join(tempDir, 'runs');
const workflowId = `gatekeeper-${process.pid}-workflow`;

after(() => rmSync(tempDir, { recursive: true, force: true }));

function statePath(id = workflowId) {
  return path.join(runsRoot, id, '.workflow-gatekeeper', 'workflow.json');
}

function gatePath(id = workflowId, gateId = 'approval-1') {
  return path.join(runsRoot, id, '.workflow-gatekeeper', 'gates', `${gateId}.json`);
}

function resumePath(id = workflowId, gateId = 'approval-1') {
  return path.join(runsRoot, id, '.workflow-gatekeeper', 'artifacts', `resume-${gateId}.json`);
}

test('workflow gatekeeper start creates durable workflow state under workflow run root', async () => {
  const response = await startWorkflowGatekeeper({
    runsRoot,
    workflowId,
    kind: 'dev-harness',
    sessionKey: 'agent:main:subagent:test',
    goal: 'Need approval.',
    now: new Date('2026-06-01T10:00:00.000Z'),
  });

  assert.equal(response.ok, true);
  assert.equal(response.workflow.workflow_id, workflowId);
  assert.equal(response.workflow.state, 'running');
  assert.equal(response.workflow.revision, 1);
  assert.equal(response.state_path, statePath());
  assert.equal(existsSync(statePath()), true);
  assert.equal(JSON.parse(readFileSync(statePath(), 'utf8')).session_key, 'agent:main:subagent:test');

  await assert.rejects(
    () => startWorkflowGatekeeper({ runsRoot, workflowId }),
    /workflow already exists/,
  );
});

test('workflow gatekeeper gate persists human gate and exposes delivery runtime gap', async () => {
  const response = await gateWorkflow({
    runsRoot,
    workflowId,
    gateId: 'approval-1',
    gateKind: 'approval',
    humanText: 'Approve implementation?',
    resumeInstruction: 'Continue the existing workflow with the approval answer.',
    choices: ['APPROVED', 'REJECTED'],
    approvalTokens: ['APPROVED', 'LGTM'],
    expiresAt: '2026-06-01T11:00:00.000Z',
    now: new Date('2026-06-01T10:01:00.000Z'),
  });

  assert.equal(response.ok, true);
  assert.equal(response.workflow.state, 'waiting_human');
  assert.equal(response.workflow.current_gate_id, 'approval-1');
  assert.equal(response.delivery.status, 'runtime_gap');
  assert.equal(response.delivery.requires_parent_delivery, true);
  assert.equal(existsSync(gatePath()), true);
  assert.equal(readFileSync(response.gate_artifact_path, 'utf8').includes('Approve implementation?'), true);

  await assert.rejects(
    () => gateWorkflow({ runsRoot, workflowId, gateId: 'approval-1', humanText: 'Overwrite?', resumeInstruction: 'No.' }),
    /workflow gate already exists/,
  );
});

test('workflow gatekeeper list and status return compact durable state', async () => {
  const listed = await listWorkflowGatekeepers({ runsRoot, state: 'waiting_human' });
  assert.equal(listed.ok, true);
  assert.equal(listed.workflows.length, 1);
  assert.equal(listed.workflows[0].workflow_id, workflowId);
  assert.equal(listed.workflows[0].delivery.status, 'runtime_gap');

  const status = await statusWorkflowGatekeeper({ runsRoot, workflowId });
  assert.equal(status.ok, true);
  assert.equal(status.workflow.state, 'waiting_human');
  assert.equal(status.current_gate.gate_id, 'approval-1');
});

test('workflow gatekeeper resume stages reply before continuation and is retry-safe', async () => {
  const response = await resumeWorkflowGatekeeper({
    runsRoot,
    workflowId,
    gateId: 'approval-1',
    answer: 'APPROVED',
    now: new Date('2026-06-01T10:02:00.000Z'),
  });

  assert.equal(response.ok, true);
  assert.equal(response.idempotent, false);
  assert.equal(response.workflow.state, 'resuming');
  assert.equal(response.delivery.status, 'runtime_gap');
  assert.equal(response.delivery.requires_parent_delivery, true);
  assert.equal(response.resume.staged_reply.includes('Human answer:\nAPPROVED'), true);
  assert.equal(existsSync(resumePath()), true);

  const retry = await resumeWorkflowGatekeeper({
    runsRoot,
    workflowId,
    gateId: 'approval-1',
    answer: 'APPROVED',
    now: new Date('2026-06-01T10:03:00.000Z'),
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);

  await assert.rejects(
    () => resumeWorkflowGatekeeper({ runsRoot, workflowId, gateId: 'approval-1', answer: 'DIFFERENT' }),
    /stale workflow gate resume|already resumed with a different answer/,
  );
});

test('workflow gatekeeper rejects expired and stale gates', async () => {
  const expiredWorkflowId = `${workflowId}-expired`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: expiredWorkflowId, now: new Date('2026-06-01T10:00:00.000Z') });
  await gateWorkflow({
    runsRoot,
    workflowId: expiredWorkflowId,
    gateId: 'expired-1',
    humanText: 'Too late?',
    resumeInstruction: 'Continue if not expired.',
    expiresAt: '2026-06-01T10:01:00.000Z',
    now: new Date('2026-06-01T10:00:30.000Z'),
  });

  await assert.rejects(
    () => resumeWorkflowGatekeeper({ runsRoot, workflowId: expiredWorkflowId, gateId: 'expired-1', answer: 'yes', now: new Date('2026-06-01T10:01:00.000Z') }),
    /workflow gate expired/,
  );
  await assert.rejects(
    () => resumeWorkflowGatekeeper({ runsRoot, workflowId: expiredWorkflowId, gateId: 'other-gate', answer: 'yes', now: new Date('2026-06-01T10:00:45.000Z') }),
    /stale workflow gate resume/,
  );
});

test('workflow gatekeeper cancel marks workflow terminal without overwriting state', async () => {
  const cancelWorkflowId = `${workflowId}-cancel`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: cancelWorkflowId });
  const cancelled = await cancelWorkflowGatekeeper({ runsRoot, workflowId: cancelWorkflowId, reason: 'No longer needed' });

  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.workflow.state, 'cancelled');

  const again = await cancelWorkflowGatekeeper({ runsRoot, workflowId: cancelWorkflowId, reason: 'Again' });
  assert.equal(again.ok, true);
  assert.equal(again.idempotent, true);
  assert.equal(again.workflow.state, 'cancelled');
});

test('workflow gatekeeper CLI exposes explicit start gate status resume cancel operations', () => {
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-gatekeeper.mjs');
  const cliRunsRoot = path.join(tempDir, 'cli-runs');
  const cliWorkflowId = `${workflowId}-cli`;

  const start = spawnSync(process.execPath, [helperPath, 'start', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--kind', 'cli-test'], { cwd: root, encoding: 'utf8' });
  assert.equal(start.status, 0, start.stderr);
  assert.equal(JSON.parse(start.stdout).workflow.workflow_id, cliWorkflowId);

  const gate = spawnSync(process.execPath, [helperPath, 'gate', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--gate-id', 'cli-gate', '--human-text', 'Proceed?', '--resume-instruction', 'Resume with answer.', '--choices', '["yes","no"]'], { cwd: root, encoding: 'utf8' });
  assert.equal(gate.status, 0, gate.stderr);
  assert.equal(JSON.parse(gate.stdout).delivery.status, 'runtime_gap');

  const status = spawnSync(process.execPath, [helperPath, 'status', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId], { cwd: root, encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).current_gate.gate_id, 'cli-gate');

  const resume = spawnSync(process.execPath, [helperPath, 'resume', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--gate-id', 'cli-gate', '--answer', 'yes'], { cwd: root, encoding: 'utf8' });
  assert.equal(resume.status, 0, resume.stderr);
  assert.equal(JSON.parse(resume.stdout).workflow.state, 'resuming');

  const cancel = spawnSync(process.execPath, [helperPath, 'cancel', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--reason', 'done'], { cwd: root, encoding: 'utf8' });
  assert.equal(cancel.status, 0, cancel.stderr);
  assert.equal(JSON.parse(cancel.stdout).workflow.state, 'cancelled');
});
