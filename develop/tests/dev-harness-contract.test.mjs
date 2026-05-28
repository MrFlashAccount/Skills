import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(root, 'develop/dev-harness.workflow.json');
const workflowDoc = JSON.parse(readFileSync(workflowPath, 'utf8'));
const tempDir = mkdtempSync(path.join(tmpdir(), 'dev-harness-contract-'));

const expectedStepIds = [
  'research_draft',
  'research_attack',
  'approve_research',
  'architecture_draft',
  'architecture_attack',
  'approve_architecture',
  'planning_draft',
  'planning_attack',
  'approve_plan',
  'backend_implementation',
  'frontend_implementation',
  'architecture_artifact_update',
  'implementation_join',
  'architect_review',
  'backend_review',
  'frontend_review',
  'frontend_taste_review',
  'security_review',
  'privacy_review',
  'qa_review',
  'review_join',
  'done',
  'blocked',
];

const forbiddenStepIds = ['research_prepare', 'implementation_route', 'review_plan'];
const implementationSteps = ['backend_implementation', 'frontend_implementation', 'architecture_artifact_update'];
const reviewSteps = ['architect_review', 'backend_review', 'frontend_review', 'frontend_taste_review', 'security_review', 'privacy_review', 'qa_review'];

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function runApply(label, batonDoc, outputDoc, expectSuccess = true) {
  const batonPath = writeJson(`${label}-baton.json`, batonDoc);
  const outputPath = writeJson(`${label}-output.json`, outputDoc);
  const result = spawnSync(process.execPath, ['develop/scripts/workflow-interpreter.mjs', 'apply', workflowPath, batonPath, outputPath], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(
    result.status === 0,
    expectSuccess,
    `${label} expected ${expectSuccess ? 'success' : 'failure'}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return expectSuccess ? JSON.parse(result.stdout) : result;
}

function baseState() {
  const planning_draft = {
    outcome: 'ready_for_attack',
    implementation_plan: {
      goal: 'Implement selected backend and architecture contract updates.',
      workstreams: [{ id: 'backend' }, { id: 'architecture' }],
      definition_of_done: ['selected work is done'],
      verification: ['npm test'],
      rollback: 'revert selected files',
    },
    selected_implementation_steps: ['backend_implementation', 'architecture_artifact_update'],
    implementation_route: 'approved_backend_architecture',
    selected_review_steps: ['backend_review', 'qa_review'],
    review_plan: {
      reviewers: [
        { step_id: 'backend_review', reason: 'backend changed', surfaces: ['backend files'], required: true },
        { step_id: 'qa_review', reason: 'verification changed', surfaces: ['tests'], required: true },
      ],
    },
  };
  const planning_attack = {
    outcome: 'approved',
    verdict: { summary: ['plan is coherent'], evidence_checked: ['planning_draft'], findings: [] },
  };
  return {
    artifacts: [],
    results: [],
    planning_draft,
    planning_attack,
    outputs: { planning_draft, planning_attack },
  };
}

function implementationOutput(summary) {
  return {
    outcome: 'implemented',
    implementation_handoff: { summary, covered_contract_rows: [], review_notes: ['ready'] },
    changed_files: ['develop/dev-harness.workflow.json'],
    verification: [{ command: 'npm test', result: 'passed' }],
  };
}

function reviewOutput(outcome = 'passed', required_implementation_steps = []) {
  return {
    outcome,
    verdict: { summary: [`review ${outcome}`], evidence_checked: ['implementation_join'], findings: [] },
    required_implementation_steps,
  };
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('DevHarness workflow exposes the required step ids and no forbidden route-only steps', () => {
  const stepIds = Object.keys(workflowDoc.workflow.steps);
  for (const stepId of expectedStepIds) assert.ok(stepIds.includes(stepId), `missing required step ${stepId}`);
  for (const stepId of forbiddenStepIds) assert.ok(!stepIds.includes(stepId), `forbidden step present ${stepId}`);
});

test('DevHarness workflow uses explicit state projections instead of artifacts/results globals', () => {
  for (const [stepId, step] of Object.entries(workflowDoc.workflow.steps)) {
    const state = step.input?.state ?? [];
    assert.ok(!state.includes('artifacts'), `${stepId} projects artifacts`);
    assert.ok(!state.includes('results'), `${stepId} projects results`);
  }
});

test('DevHarness worker steps declare output schemas from the colocated DevHarness schema folder', () => {
  for (const [stepId, step] of Object.entries(workflowDoc.workflow.steps)) {
    if (step.kind !== 'worker') continue;
    assert.match(step.output?.schema ?? '', /^develop\/schemas\/dev-harness\/.+\.json$/, `${stepId} has no colocated output.schema`);
  }
});

test('approve_plan statically routes only the selected approved implementation subset', () => {
  const response = runApply(
    'approve-plan-selected-subset',
    { cursor: 'approve_plan', status: 'running', state: baseState() },
    { approval: 'approved_backend_architecture' },
  );

  assert.deepEqual(response.steps.map((step) => step.id), ['backend_implementation', 'architecture_artifact_update']);
  assert.ok(!response.steps.some((step) => step.id === 'frontend_implementation'));
});

test('implementation_join routes to selected reviewers, not every reviewer', () => {
  const state = baseState();
  state.backend_implementation = implementationOutput('backend done');
  state.architecture_artifact_update = implementationOutput('architecture done');
  state.outputs.backend_implementation = state.backend_implementation;
  state.outputs.architecture_artifact_update = state.architecture_artifact_update;

  const response = runApply(
    'implementation-join-selected-reviewers',
    { cursor: 'implementation_join', status: 'running', state },
    {
      outcome: 'ready_for_review',
      reviewer_handoff: {
        summary: 'selected implementation outputs are ready for selected reviewers',
        selected_implementation_steps: ['backend_implementation', 'architecture_artifact_update'],
        selected_review_steps: ['backend_review', 'qa_review'],
        evidence: ['backend output', 'architecture output'],
      },
      next: ['backend_review', 'qa_review'],
    },
  );

  assert.deepEqual(response.steps.map((step) => step.id), ['backend_review', 'qa_review']);
  for (const unselected of reviewSteps.filter((stepId) => !['backend_review', 'qa_review'].includes(stepId))) {
    assert.ok(!response.steps.some((step) => step.id === unselected), `unexpected reviewer ${unselected}`);
  }
});

test('review_join returns only relevant implementation steps on needs_changes', () => {
  const state = baseState();
  state.implementation_join = {
    outcome: 'ready_for_review',
    reviewer_handoff: {
      summary: 'ready',
      selected_implementation_steps: ['backend_implementation', 'architecture_artifact_update'],
      selected_review_steps: ['backend_review', 'qa_review'],
      evidence: ['evidence'],
    },
    next: ['backend_review', 'qa_review'],
  };
  state.backend_review = reviewOutput('needs_changes', ['backend_implementation']);
  state.qa_review = reviewOutput('passed');
  state.outputs.implementation_join = state.implementation_join;
  state.outputs.backend_review = state.backend_review;
  state.outputs.qa_review = state.qa_review;

  const response = runApply(
    'review-join-needs-changes-subset',
    { cursor: 'review_join', status: 'running', state },
    {
      outcome: 'needs_changes',
      verdict: {
        summary: ['backend must be fixed'],
        selected_review_steps: ['backend_review', 'qa_review'],
        failed_review_steps: ['backend_review'],
        required_implementation_steps: ['backend_implementation'],
      },
      next: ['backend_implementation'],
    },
  );

  assert.deepEqual(response.steps.map((step) => step.id), ['backend_implementation']);
  for (const unselected of implementationSteps.filter((stepId) => stepId !== 'backend_implementation')) {
    assert.ok(!response.steps.some((step) => step.id === unselected), `unexpected implementation rerun ${unselected}`);
  }
});

test('blocked dynamic joins return the blocked terminal with structured blocker data', () => {
  const state = baseState();
  const response = runApply(
    'implementation-join-blocked',
    { cursor: 'implementation_join', status: 'running', state },
    {
      outcome: 'blocked',
      reviewer_handoff: {
        summary: 'missing selected implementation output',
        selected_implementation_steps: ['backend_implementation', 'architecture_artifact_update'],
        selected_review_steps: ['backend_review', 'qa_review'],
        evidence: ['architecture_artifact_update output missing'],
      },
      next: 'blocked',
      blocker: {
        summary: 'selected implementation output missing',
        source_step_id: 'implementation_join',
        needed: 'architecture_artifact_update output',
        evidence: ['planning_draft selected architecture_artifact_update'],
      },
    },
  );

  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.baton.blocker.source_step_id, 'implementation_join');
});
