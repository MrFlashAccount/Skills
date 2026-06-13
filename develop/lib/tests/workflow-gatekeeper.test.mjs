import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  assert.equal(response.state_path, '.workflow-gatekeeper/workflow.json');
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
  assert.equal(response.gate.human_text, undefined);
  assert.equal(response.gate.resume_instruction, undefined);
  assert.equal(response.gate.approval_tokens, undefined);
  assert.equal(response.gate_artifact_path, '.workflow-gatekeeper/artifacts/gate-approval-1.md');
  assert.equal(readFileSync(path.join(runsRoot, workflowId, response.gate_artifact_path), 'utf8').includes('Approve implementation?'), true);

  await assert.rejects(
    () => gateWorkflow({ runsRoot, workflowId, gateId: 'approval-1', humanText: 'Overwrite?', resumeInstruction: 'No.' }),
    /workflow gate conflict for existing gate_id: approval-1/,
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
  assert.equal(status.current_gate.human_text, undefined);
  assert.equal(status.current_gate.resume_instruction, undefined);
  assert.equal(status.current_gate.approval_tokens, undefined);
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
  assert.equal(response.resume.staged_reply, undefined);
  assert.equal(response.resume.answer_canonical, undefined);
  assert.equal(response.resume_artifact_path, '.workflow-gatekeeper/artifacts/resume-approval-1.json');
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
  assert.equal(retry.resume.staged_reply, undefined);
  assert.equal(retry.resume.answer_canonical, undefined);

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

test('workflow gatekeeper rejects a second active gate', async () => {
  const activeWorkflowId = `${workflowId}-active`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: activeWorkflowId });
  await gateWorkflow({
    runsRoot,
    workflowId: activeWorkflowId,
    gateId: 'active-1',
    humanText: 'First?',
    resumeInstruction: 'Resume first.',
  });

  await assert.rejects(
    () => gateWorkflow({ runsRoot, workflowId: activeWorkflowId, gateId: 'active-2', humanText: 'Second?', resumeInstruction: 'Resume second.' }),
    /workflow already has an active gate: active-1/,
  );
});

test('workflow gatekeeper treats same waiting gate retry as idempotent and rejects changed duplicate payload', async () => {
  const retryWorkflowId = `${workflowId}-gate-retry`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: retryWorkflowId });
  await gateWorkflow({
    runsRoot,
    workflowId: retryWorkflowId,
    gateId: 'retry-1',
    humanText: 'Same gate?',
    resumeInstruction: 'Resume same gate.',
    choices: ['yes'],
    approvalTokens: ['LGTM'],
    expiresAt: '2026-06-01T11:00:00.000Z',
  });

  const retry = await gateWorkflow({
    runsRoot,
    workflowId: retryWorkflowId,
    gateId: 'retry-1',
    humanText: 'Same gate?',
    resumeInstruction: 'Resume same gate.',
    choices: ['yes'],
    approvalTokens: ['LGTM'],
    expiresAt: '2026-06-01T11:00:00.000Z',
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.workflow.state, 'waiting_human');

  await assert.rejects(
    () => gateWorkflow({
      runsRoot,
      workflowId: retryWorkflowId,
      gateId: 'retry-1',
      humanText: 'Same gate?',
      resumeInstruction: 'Resume same gate.',
      choices: ['no'],
      approvalTokens: ['LGTM'],
      expiresAt: '2026-06-01T11:00:00.000Z',
    }),
    /workflow gate conflict for existing gate_id: retry-1/,
  );
});

test('workflow gatekeeper rejects second active gate while resuming', async () => {
  const resumingWorkflowId = `${workflowId}-resuming-active`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: resumingWorkflowId });
  await gateWorkflow({ runsRoot, workflowId: resumingWorkflowId, gateId: 'resuming-1', humanText: 'First?', resumeInstruction: 'Resume first.' });
  await resumeWorkflowGatekeeper({ runsRoot, workflowId: resumingWorkflowId, gateId: 'resuming-1', answer: 'yes' });

  await assert.rejects(
    () => gateWorkflow({ runsRoot, workflowId: resumingWorkflowId, gateId: 'resuming-2', humanText: 'Second?', resumeInstruction: 'Resume second.' }),
    /workflow already has an active gate: resuming-1/,
  );
});

test('workflow gatekeeper rejects terminal resume retry and does not resurrect cancelled workflow', async () => {
  const cancelledResumeWorkflowId = `${workflowId}-cancelled-resume`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: cancelledResumeWorkflowId });
  await gateWorkflow({ runsRoot, workflowId: cancelledResumeWorkflowId, gateId: 'cancel-resume-1', humanText: 'Approve?', resumeInstruction: 'Resume if approved.' });
  await resumeWorkflowGatekeeper({ runsRoot, workflowId: cancelledResumeWorkflowId, gateId: 'cancel-resume-1', answer: 'yes' });
  await cancelWorkflowGatekeeper({ runsRoot, workflowId: cancelledResumeWorkflowId, reason: 'stop' });

  await assert.rejects(
    () => resumeWorkflowGatekeeper({ runsRoot, workflowId: cancelledResumeWorkflowId, gateId: 'cancel-resume-1', answer: 'yes' }),
    /workflow is terminal and cannot resume/,
  );
  assert.equal(JSON.parse(readFileSync(statePath(cancelledResumeWorkflowId), 'utf8')).state, 'cancelled');
});

test('workflow gatekeeper atomic writes leave no temp files on successful start gate resume path', async () => {
  const atomicWorkflowId = `${workflowId}-atomic`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: atomicWorkflowId });
  await gateWorkflow({ runsRoot, workflowId: atomicWorkflowId, gateId: 'atomic-1', humanText: 'Atomic gate?', resumeInstruction: 'Resume atomically.' });
  await resumeWorkflowGatekeeper({ runsRoot, workflowId: atomicWorkflowId, gateId: 'atomic-1', answer: 'yes' });

  const gatekeeperDir = path.join(runsRoot, atomicWorkflowId, '.workflow-gatekeeper');
  const leftoverTemps = [
    ...readdirSync(gatekeeperDir),
    ...readdirSync(path.join(gatekeeperDir, 'gates')),
    ...readdirSync(path.join(gatekeeperDir, 'artifacts')),
  ].filter((entry) => entry.endsWith('.tmp'));
  assert.deepEqual(leftoverTemps, []);
});

test('workflow gatekeeper recovers gate and resume partial writes without leaking answers', async () => {
  const partialGateWorkflowId = `${workflowId}-partial-gate`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: partialGateWorkflowId, now: new Date('2026-06-01T10:00:00.000Z') });
  const partialGateDir = path.join(runsRoot, partialGateWorkflowId, '.workflow-gatekeeper', 'gates');
  mkdirSync(partialGateDir, { recursive: true });
  writeFileSync(path.join(partialGateDir, 'partial-1.json'), `${JSON.stringify({
    schema_version: 1,
    workflow_id: partialGateWorkflowId,
    gate_id: 'partial-1',
    gate_kind: 'approval',
    state: 'waiting_human',
    human_text: 'Recover me?',
    resume_instruction: 'Resume recovered gate.',
    choices: [],
    approval_tokens: ['SECRET'],
    delivery: { status: 'runtime_gap', delivered: false, requires_parent_delivery: true, updated_at: '2026-06-01T10:01:00.000Z' },
    created_at: '2026-06-01T10:01:00.000Z',
    updated_at: '2026-06-01T10:01:00.000Z',
    revision: 1,
  }, null, 2)}\n`);

  const recoveredGate = await gateWorkflow({ runsRoot, workflowId: partialGateWorkflowId, gateId: 'partial-1', humanText: 'Recover me?', resumeInstruction: 'Resume recovered gate.', approvalTokens: ['SECRET'] });
  assert.equal(recoveredGate.ok, true);
  assert.equal(recoveredGate.recovered, true);
  assert.equal(recoveredGate.workflow.state, 'waiting_human');
  assert.equal(recoveredGate.gate.approval_tokens, undefined);

  const conflictingPartialGateWorkflowId = `${workflowId}-partial-gate-conflict`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: conflictingPartialGateWorkflowId, now: new Date('2026-06-01T10:00:00.000Z') });
  const conflictingPartialGateDir = path.join(runsRoot, conflictingPartialGateWorkflowId, '.workflow-gatekeeper', 'gates');
  mkdirSync(conflictingPartialGateDir, { recursive: true });
  const conflictingPartialGatePath = path.join(conflictingPartialGateDir, 'partial-conflict.json');
  const originalConflictingGate = `${JSON.stringify({
    schema_version: 1,
    workflow_id: conflictingPartialGateWorkflowId,
    gate_id: 'partial-conflict',
    gate_kind: 'approval',
    state: 'waiting_human',
    human_text: 'Original text?',
    resume_instruction: 'Original resume.',
    choices: ['yes'],
    approval_tokens: ['TOKEN'],
    delivery: { status: 'runtime_gap', delivered: false, requires_parent_delivery: true, updated_at: '2026-06-01T10:01:00.000Z' },
    created_at: '2026-06-01T10:01:00.000Z',
    updated_at: '2026-06-01T10:01:00.000Z',
    revision: 1,
  }, null, 2)}\n`;
  writeFileSync(conflictingPartialGatePath, originalConflictingGate);
  await assert.rejects(
    () => gateWorkflow({ runsRoot, workflowId: conflictingPartialGateWorkflowId, gateId: 'partial-conflict', humanText: 'Changed text?', resumeInstruction: 'Original resume.', choices: ['yes'], approvalTokens: ['TOKEN'] }),
    /workflow gate conflict for existing gate_id: partial-conflict/,
  );
  assert.equal(readFileSync(conflictingPartialGatePath, 'utf8'), originalConflictingGate);

  const partialResumeWorkflowId = `${workflowId}-partial-resume`;
  await startWorkflowGatekeeper({ runsRoot, workflowId: partialResumeWorkflowId });
  await gateWorkflow({ runsRoot, workflowId: partialResumeWorkflowId, gateId: 'resume-partial', humanText: 'Approve?', resumeInstruction: 'Resume partial.' });
  const partialResumeDir = path.join(runsRoot, partialResumeWorkflowId, '.workflow-gatekeeper', 'artifacts');
  mkdirSync(partialResumeDir, { recursive: true });
  writeFileSync(path.join(partialResumeDir, 'resume-resume-partial.json'), `${JSON.stringify({
    schema_version: 1,
    workflow_id: partialResumeWorkflowId,
    gate_id: 'resume-partial',
    answer: 'SECRET-ANSWER',
    answer_canonical: 'SECRET-ANSWER',
    resume_instruction: 'Resume partial.',
    staged_reply: 'Resume partial.\n\nHuman answer:\nSECRET-ANSWER',
    continuation: { status: 'runtime_gap', delivered: false, requires_parent_delivery: true, updated_at: '2026-06-01T10:02:00.000Z' },
    created_at: '2026-06-01T10:02:00.000Z',
  }, null, 2)}\n`);

  const recoveredResume = await resumeWorkflowGatekeeper({ runsRoot, workflowId: partialResumeWorkflowId, gateId: 'resume-partial', answer: 'SECRET-ANSWER' });
  assert.equal(recoveredResume.ok, true);
  assert.equal(recoveredResume.recovered, true);
  assert.equal(recoveredResume.workflow.state, 'resuming');
  assert.equal(recoveredResume.resume.answer, undefined);
  assert.equal(recoveredResume.resume.answer_canonical, undefined);
  assert.equal(recoveredResume.resume.staged_reply, undefined);
});

test('workflow gatekeeper list exposes corrupt skipped state and validates limits', async () => {
  const corruptWorkflowId = `${workflowId}-corrupt`;
  const corruptDir = path.join(runsRoot, corruptWorkflowId, '.workflow-gatekeeper');
  mkdirSync(corruptDir, { recursive: true });
  writeFileSync(path.join(corruptDir, 'workflow.json'), '{bad json');

  const listed = await listWorkflowGatekeepers({ runsRoot, limit: 100 });
  assert.equal(listed.ok, true);
  assert.equal(listed.skipped.some((entry) => entry.workflow_id === corruptWorkflowId && entry.reason.includes('cannot parse workflow gatekeeper state')), true);
  await assert.rejects(() => listWorkflowGatekeepers({ runsRoot, limit: 0 }), /invalid limit: 0/);
  await assert.rejects(() => listWorkflowGatekeepers({ runsRoot, limit: Number.NaN }), /invalid limit: NaN/);
});

test('workflow gatekeeper CLI exposes explicit start gate list status resume cancel operations and validates args', () => {
  const helperPath = path.join(root, 'develop/lib/entrypoints/cli/workflow-gatekeeper.mjs');
  const cliRunsRoot = path.join(tempDir, 'cli-runs');
  const cliWorkflowId = `${workflowId}-cli`;

  const start = spawnSync(process.execPath, [helperPath, 'start', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--kind', 'cli-test'], { cwd: root, encoding: 'utf8' });
  assert.equal(start.status, 0, start.stderr);
  assert.equal(JSON.parse(start.stdout).workflow.workflow_id, cliWorkflowId);

  const gate = spawnSync(process.execPath, [helperPath, 'gate', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--gate-id', 'cli-gate', '--human-text', 'Proceed?', '--resume-instruction', 'Resume with answer.', '--choices', '["yes","no"]'], { cwd: root, encoding: 'utf8' });
  assert.equal(gate.status, 0, gate.stderr);
  assert.equal(JSON.parse(gate.stdout).delivery.status, 'runtime_gap');

  const list = spawnSync(process.execPath, [helperPath, 'list', '--runs-root', cliRunsRoot, '--limit', '1'], { cwd: root, encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).workflows.length, 1);

  const status = spawnSync(process.execPath, [helperPath, 'status', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId], { cwd: root, encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  const statusOutput = JSON.parse(status.stdout);
  assert.equal(statusOutput.current_gate.gate_id, 'cli-gate');
  assert.equal(statusOutput.current_gate.human_text, undefined);
  assert.equal(statusOutput.current_gate.resume_instruction, undefined);

  const resume = spawnSync(process.execPath, [helperPath, 'resume', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--gate-id', 'cli-gate', '--answer', 'yes'], { cwd: root, encoding: 'utf8' });
  assert.equal(resume.status, 0, resume.stderr);
  const resumeOutput = JSON.parse(resume.stdout);
  assert.equal(resumeOutput.workflow.state, 'resuming');
  assert.equal(resumeOutput.resume.staged_reply, undefined);
  assert.equal(resumeOutput.resume.answer_canonical, undefined);

  const cancel = spawnSync(process.execPath, [helperPath, 'cancel', '--runs-root', cliRunsRoot, '--workflow-id', cliWorkflowId, '--reason', 'done'], { cwd: root, encoding: 'utf8' });
  assert.equal(cancel.status, 0, cancel.stderr);
  assert.equal(JSON.parse(cancel.stdout).workflow.state, 'cancelled');

  const badMode = spawnSync(process.execPath, [helperPath, 'unknown'], { cwd: root, encoding: 'utf8' });
  assert.equal(badMode.status, 1);
  assert.match(badMode.stderr, /usage:/);

  const badLimit = spawnSync(process.execPath, [helperPath, 'list', '--runs-root', cliRunsRoot, '--limit', '0'], { cwd: root, encoding: 'utf8' });
  assert.equal(badLimit.status, 1);
  assert.match(badLimit.stderr, /invalid limit: 0/);
});
