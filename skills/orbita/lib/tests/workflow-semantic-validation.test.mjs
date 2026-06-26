import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import workflowDoc from '../../../../workflows/dev-harness/workflow.json' with { type: 'json' };
import researchCriticWorkflowDoc from '../../../../workflows/research-critic/workflow.json' with { type: 'json' };
import workflowAuthoringWorkflowDoc from '../../../../workflows/workflow-authoring/workflow.json' with { type: 'json' };
import { WorkflowRuntimeError } from '../errors.mjs';
import { validateWorkflow } from '../use-cases/ValidateWorkflow.mjs';
import { validateWorkflowFile } from '../entrypoints/api/validateWorkflow.mjs';
import { readOutputSchemas, readAllowedRoles } from '../persistence/workflow-resources/workflow-file-reader.mjs';
import { validateAgainstOutputSchema } from '../use-cases/runtime/output/output-schema-validation.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });
}
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-semantic-validation-'));
mkdirSync(path.join(tempDir, 'schemas'), { recursive: true });
cpSync(path.join(REPO_ROOT, 'workflows/dev-harness/schemas'), path.join(tempDir, 'schemas'), { recursive: true });

function validateWithRuntimeArchitecture(doc, { workflowPath }) {
  const outputSchemas = readOutputSchemas({ workflow: doc, workflowPath, repositoryRoot: REPO_ROOT });
  const allowedRoles = readAllowedRoles({ repositoryRoot: REPO_ROOT });
  return validateWorkflow({ workflowDTO: doc, outputSchemas, allowedRoles }).toJSON();
}

function validate(doc) {
  return validateWithRuntimeArchitecture(doc, { workflowPath: path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json') });
}

function validateSynthetic(doc) {
  return validateWithRuntimeArchitecture(doc, { workflowPath: path.join(tempDir, 'workflow.json') });
}

function assertSemanticFailure(doc, pattern) {
  assert.throws(() => validateSynthetic(doc), (error) => {
    assert.equal(error instanceof WorkflowRuntimeError, true);
    assert.match(error.message, pattern);
    return true;
  });
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

function writeSchema(name, schema) {
  writeFileSync(path.join(tempDir, name), `${JSON.stringify(schema, null, 2)}\n`);
}

const routeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome', 'route', 'next_steps'],
  properties: {
    outcome: { enum: ['ready', 'blocked'] },
    route: { enum: ['review', 'blocked'] },
    next_steps: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: ['branch_a', 'branch_b'] },
    },
  },
  additionalProperties: false,
};

writeSchema('route-output.schema.json', routeSchema);
writeSchema('bad-array-output.schema.json', {
  ...routeSchema,
  properties: {
    ...routeSchema.properties,
    next_steps: {
      type: 'array',
      items: { enum: ['branch_a', 'branch_b'] },
    },
  },
});
writeSchema('unknown-array-target-output.schema.json', {
  ...routeSchema,
  properties: {
    ...routeSchema.properties,
    next_steps: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: ['branch_a', 'missing_branch'] },
    },
  },
});

function genericWorkflowWithWorkerRole(role) {
  return {
      name: 'generic-role-validation-fixture',
      version: 1,
      start: 'worker_step',
      done: 'done',
      blocked: 'blocked',
      steps: {
        worker_step: {
          name: 'Worker step',
          kind: 'worker',
          input: { role, prompt: 'Run worker.' },
          output: { template: 'worker.md' },
          next: 'done',
        },
        done: { name: 'Done', kind: 'done' },
        blocked: { name: 'Blocked', kind: 'blocked' },
      },

  };
}

function syntheticWorkflow(overrides) {
  const doc = {
      name: 'synthetic-validation-fixture',
      version: 1,
      start: 'producer',
      done: 'done',
      blocked: 'blocked',
      steps: {
        producer: {
          name: 'Producer',
          kind: 'worker',
          output: { template: 'producer.md', schema: 'route-output.schema.json' },
          next: { match: '${{ output.outcome }}', cases: { ready: 'consumer', blocked: 'blocked' } },
        },
        consumer: {
          name: 'Consumer',
          kind: 'worker',
          input: { state: ['producer'] },
          output: { template: 'consumer.md', schema: 'route-output.schema.json' },
          next: 'done',
        },
        branch_a: {
          name: 'Branch A',
          kind: 'worker',
          input: { state: ['producer'] },
          output: { template: 'branch-a.md', schema: 'route-output.schema.json' },
          next: 'join',
        },
        branch_b: {
          name: 'Branch B',
          kind: 'worker',
          input: { state: ['producer'] },
          output: { template: 'branch-b.md', schema: 'route-output.schema.json' },
          next: 'join',
        },
        join: {
          name: 'Join',
          kind: 'worker',
          input: { state: ['producer', 'branch_a', 'branch_b'] },
          output: { template: 'join.md', schema: 'route-output.schema.json' },
          next: 'done',
        },
        done: { name: 'Done', kind: 'done', input: { state: ['consumer'] } },
        blocked: { name: 'Blocked', kind: 'blocked', input: { state: ['producer'] } },
      },

  };
  return overrides?.(doc) ?? doc;
}

test('workflow semantic validation accepts the checked-in flat DevHarness workflow', () => {
  assert.equal(Object.hasOwn(workflowDoc, 'workflow'), false);
  assert.deepEqual(validate(workflowDoc), { ok: true, workflow: 'dev-harness', steps: Object.keys(workflowDoc.steps).length });
});

test('DevHarness proposal handoff prompts use baton artifacts instead of temp files', () => {
  assert.match(workflowDoc.steps.architecture_draft.input.prompt, /emit it as workflow artifact `architecture-proposal`/);
  assert.match(workflowDoc.steps.architecture_draft.input.prompt, /artifact metadata\/path accepted into baton is the source of truth/);
  assert.match(workflowDoc.steps.approve_architecture.input.prompt, /projected `architecture-proposal` artifact from architecture_draft/);
  assert.match(workflowDoc.steps.approve_architecture.input.prompt, /retrieve\/export the existing artifact referenced by projected baton\/output artifacts/);
  assert.match(workflowDoc.steps.approve_architecture.input.prompt, /do not ask a worker to recreate it in a temp path/);
  assert.match(workflowDoc.steps.approve_plan.input.prompt, /retrieve\/export the existing artifact referenced by projected baton\/output artifacts/);
});

test('workflow semantic validation rejects wrapped workflow documents', () => {
  const flat = syntheticWorkflow();
  const wrapped = { workflow: structuredClone(flat) };

  assert.deepEqual(validateSynthetic(flat), { ok: true, workflow: 'synthetic-validation-fixture', steps: Object.keys(flat.steps).length });
  assertSemanticFailure(wrapped, /workflow failed schema validation/);
});

test('workflow semantic validation rejects workflow wrapper field on flat documents', () => {
  const flat = syntheticWorkflow();
  flat.workflow = structuredClone(syntheticWorkflow());

  assertSemanticFailure(flat, /workflow failed schema validation/);
});

test('research critic save step uses persistence metadata template matching its output schema', () => {
  const step = researchCriticWorkflowDoc.steps.save_research_packet;

  assert.equal(step.output.template, '../../shared/templates/research-save-metadata-template.md');
  assert.equal(step.output.schema, 'schemas/save-research-packet-output.json');
  assert.notEqual(step.output.template, '../../shared/templates/research-packet-template.md');
  assert.deepEqual(validateWithRuntimeArchitecture(researchCriticWorkflowDoc, { workflowPath: path.join(REPO_ROOT, 'workflows/research-critic/workflow.json') }), {
    ok: true,
    workflow: 'research-critic',
    steps: Object.keys(researchCriticWorkflowDoc.steps).length,
  });
});

test('research critic saved packet output requires projected artifacts and results', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/research-critic/workflow.json');
  const step = researchCriticWorkflowDoc.steps.save_research_packet;

  const missingProjection = validateAgainstOutputSchema({
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
    output: { outcome: 'saved', saved: { summary: 'Saved.' } },
  });
  assert.equal(missingProjection.ok, false);
  assert.match(missingProjection.errors, /artifacts/);
  assert.match(missingProjection.errors, /results/);

  const emptyProjection = validateAgainstOutputSchema({
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
    output: { outcome: 'saved', saved: { summary: 'Saved.' }, artifacts: [], results: [] },
  });
  assert.equal(emptyProjection.ok, false);
  assert.match(emptyProjection.errors, /artifacts/);
  assert.match(emptyProjection.errors, /results/);

  const withProjection = validateAgainstOutputSchema({
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
    output: {
      outcome: 'saved',
      saved: { summary: 'Saved.' },
      artifacts: [{ id: 'research-packet', content_type: 'text/markdown', summary: 'Saved packet.', path: '/runs/save_research_packet/artifacts/research-packet.md' }],
      results: [{ summary: 'Saved packet.' }],
    },
  });
  assert.equal(withProjection.ok, true);
});

test('research critic save packet output keeps saved and blocked branches exclusive', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/research-critic/workflow.json');
  const step = researchCriticWorkflowDoc.steps.save_research_packet;
  const schemaContext = {
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
  };

  const blockedWithProjection = validateAgainstOutputSchema({
    ...schemaContext,
    output: {
      outcome: 'blocked',
      blocker: { summary: 'Cannot save.', source_step_id: 'save_research_packet', needed: 'Writable target.' },
      saved: { summary: 'Should not coexist.' },
      artifacts: [{ id: 'research-packet', content_type: 'text/markdown', summary: 'Should not aggregate.', path: '/runs/save_research_packet/artifacts/research-packet.md' }],
      results: [{ summary: 'Should not aggregate.' }],
    },
  });
  assert.equal(blockedWithProjection.ok, false);

  const savedWithBlocker = validateAgainstOutputSchema({
    ...schemaContext,
    output: {
      outcome: 'saved',
      saved: { summary: 'Saved.' },
      artifacts: [{ id: 'research-packet', content_type: 'text/markdown', summary: 'Saved packet.', path: '/runs/save_research_packet/artifacts/research-packet.md' }],
      results: [{ summary: 'Saved packet.' }],
      blocker: { summary: 'Should not coexist.', source_step_id: 'save_research_packet', needed: 'Nothing.' },
    },
  });
  assert.equal(savedWithBlocker.ok, false);

  const blockedOnly = validateAgainstOutputSchema({
    ...schemaContext,
    output: { outcome: 'blocked', blocker: { summary: 'Cannot save.', source_step_id: 'save_research_packet', needed: 'Writable target.' } },
  });
  assert.equal(blockedOnly.ok, true);
});





test('dev harness revision loops project the feedback that caused revision', () => {
  assert.deepEqual(workflowDoc.steps.research_draft.input.state, ['research_draft', 'research_attack', 'approve_research']);
  assert.deepEqual(workflowDoc.steps.architecture_draft.input.state, [
    'research_draft',
    'research_attack',
    'architecture_draft',
    'architecture_attack',
    'approve_architecture',
  ]);
  assert.deepEqual(workflowDoc.steps.planning_draft.input.state, [
    'research_draft',
    'architecture_draft',
    'architecture_attack',
    'planning_draft',
    'planning_attack',
    'approve_plan',
  ]);
});

test('workflow authoring design revision projects prior feedback', () => {
  assert.deepEqual(workflowAuthoringWorkflowDoc.steps.workflow_design_draft.input.state, [
    'workflow_design_draft',
    'workflow_design_attack',
    'approve_workflow_design',
  ]);
  assert.match(workflowAuthoringWorkflowDoc.steps.workflow_design_draft.input.prompt, /When revising after workflow_design_attack feedback or approve_workflow_design rejection/);
});

test('workflow authoring implementation revision projects review findings', () => {
  assert.deepEqual(workflowAuthoringWorkflowDoc.steps.workflow_implementation.input.state, [
    'workflow_design_draft',
    'workflow_design_attack',
    'approve_workflow_design',
    'workflow_implementation',
    'workflow_implementation_attack',
  ]);
  assert.match(workflowAuthoringWorkflowDoc.steps.workflow_implementation.input.prompt, /When revising after workflow_implementation_attack feedback/);
});

test('workflow authoring design output requires branch payloads', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/workflow-authoring/workflow.json');
  const schemaContext = {
    workflow: workflowAuthoringWorkflowDoc,
    workflowPath,
    schemaRef: workflowAuthoringWorkflowDoc.steps.workflow_design_draft.output.schema,
    repositoryRoot: REPO_ROOT,
  };

  const missingContract = validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'ready_for_attack' } });
  assert.equal(missingContract.ok, false);
  assert.match(missingContract.errors, /workflow_contract/);

  const withContract = validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'ready_for_attack', workflow_contract: { name: 'example' } } });
  assert.equal(withContract.ok, true);

  const missingBlocker = validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'blocked' } });
  assert.equal(missingBlocker.ok, false);
  assert.match(missingBlocker.errors, /blocker/);

  const withBlocker = validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'blocked', blocker: { summary: 'Blocked.' } } });
  assert.equal(withBlocker.ok, true);
});

test('revision loop continuity separates projected state from clarification-session continuation', () => {
  const loopIterationContinuityPrompt = /Loop continuity across workflow loop iterations is prompt\/state based/;
  const noPersistentDraftCriticReuse = /do not assume persistent draft\/critic worker reuse across iterations/;
  const clarificationContinuation = /If concise clarification is needed, do not ask the user directly; return a clarification request for the orchestrator to relay, then continue in the same clarification session after the orchestrator forwards the user's reply without restart or context widening/;
  const contradictorySameSessionWording = /not same-session memory|hidden same-session memory|ask, pause/;
  const devHarnessResearchPrompt = workflowDoc.steps.research_draft.input.prompt;

  assert.match(
    devHarnessResearchPrompt,
    /When missing implementation-critical input is answerable by the user, do not return blocked; return a focused user-facing request for the orchestrator to relay\./,
  );
  assert.match(
    devHarnessResearchPrompt,
    /Return blocked with blocker\.source_step_id = research_draft only when progress is unsafe or impossible, or when the missing input is external\/non-user-answerable\./,
  );
  assert.doesNotMatch(devHarnessResearchPrompt, /blocked .* when implementation-critical input is missing/);

  for (const stepId of ['research_draft', 'architecture_draft', 'planning_draft', 'backend_implementation', 'frontend_implementation', 'architecture_artifact_update']) {
    const prompt = workflowDoc.steps[stepId].input.prompt;
    assert.match(prompt, loopIterationContinuityPrompt);
    assert.match(prompt, noPersistentDraftCriticReuse);
    assert.match(prompt, clarificationContinuation);
    assert.doesNotMatch(prompt, contradictorySameSessionWording);
  }

  for (const stepId of ['research_draft', 'research_answered_draft', 'research_attack', 'research_revision', 'save_research_packet']) {
    const prompt = researchCriticWorkflowDoc.steps[stepId].input.prompt;
    assert.match(prompt, loopIterationContinuityPrompt);
    assert.match(prompt, noPersistentDraftCriticReuse);
    assert.match(prompt, clarificationContinuation);
    assert.doesNotMatch(prompt, contradictorySameSessionWording);
  }

  assert.match(
    researchCriticWorkflowDoc.steps.research_draft.input.prompt,
    /Return ready_for_attack when the packet is ready for critic review, needs_input when user answers are required, or blocked when progress is unsafe without external input\./,
  );
  assert.equal(researchCriticWorkflowDoc.steps.research_draft.next.cases.needs_input, 'ask_research_questions');
});



test('dev harness architect review projects approved architecture contract sources', () => {
  for (const requiredState of ['architecture_draft', 'architecture_attack', 'approve_architecture']) {
    assert.equal(workflowDoc.steps.architect_review.input.state.includes(requiredState), true);
  }
  assert.match(workflowDoc.steps.architect_review.input.prompt, /approved architecture contract/);
});

test('dev harness implementation rework branches project review findings', () => {
  const expectedReworkState = [
    'planning_draft',
    'implementation_dispatch',
    'review_join',
    'architect_review',
    'backend_review',
    'frontend_review',
    'frontend_taste_review',
    'security_review',
    'privacy_review',
    'qa_review',
  ];

  for (const stepId of ['backend_implementation', 'frontend_implementation', 'architecture_artifact_update']) {
    assert.deepEqual(workflowDoc.steps[stepId].input.state, expectedReworkState);
    assert.match(workflowDoc.steps[stepId].input.prompt, /review_join needs_changes/);
  }
});

test('dev harness blocked outputs require only blocker plus routing fields, not success payloads', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json');
  const blockedCases = [
    ['research_draft', { outcome: 'blocked', blocker: { summary: 'Missing input.', source_step_id: 'research_draft', needed: 'Task context.' } }],
    ['research_attack', { outcome: 'blocked', blocker: { summary: 'Unsafe research.', source_step_id: 'research_attack', needed: 'Evidence.' } }],
    ['architecture_draft', { outcome: 'blocked', blocker: { summary: 'No owner.', source_step_id: 'architecture_draft', needed: 'Architecture owner.' } }],
    ['architecture_attack', { outcome: 'blocked', blocker: { summary: 'Contract conflict.', source_step_id: 'architecture_attack', needed: 'Decision.' } }],
    ['planning_draft', { outcome: 'blocked', selected_review_steps: ['backend_review'], blocker: { summary: 'Cannot plan.', source_step_id: 'planning_draft', needed: 'Approved scope.' } }],
    ['planning_attack', { outcome: 'blocked', blocker: { summary: 'Plan unsafe.', source_step_id: 'planning_attack', needed: 'Revision.' } }],
    ['implementation_dispatch', { outcome: 'blocked', blocker: { summary: 'Route mismatch.', source_step_id: 'implementation_dispatch', needed: 'Valid route.' } }],
    ['backend_implementation', { outcome: 'blocked', blocker: { summary: 'Backend blocked.', source_step_id: 'backend_implementation', needed: 'Dependency.' } }],
    ['frontend_implementation', { outcome: 'blocked', blocker: { summary: 'Frontend blocked.', source_step_id: 'frontend_implementation', needed: 'Dependency.' } }],
    ['architecture_artifact_update', { outcome: 'blocked', blocker: { summary: 'Artifact blocked.', source_step_id: 'architecture_artifact_update', needed: 'Approved artifact.' } }],
    ['implementation_join', { outcome: 'blocked', blocker: { summary: 'Branch missing.', source_step_id: 'implementation_join', needed: 'Completed branch.' } }],
    ['architect_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'architect_review', needed: 'Diff.' } }],
    ['backend_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'backend_review', needed: 'Diff.' } }],
    ['frontend_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'frontend_review', needed: 'Diff.' } }],
    ['frontend_taste_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'frontend_taste_review', needed: 'Rendered surface.' } }],
    ['security_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'security_review', needed: 'Trust boundary.' } }],
    ['privacy_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'privacy_review', needed: 'Data flow.' } }],
    ['qa_review', { outcome: 'blocked', blocker: { summary: 'Cannot review.', source_step_id: 'qa_review', needed: 'Verification evidence.' } }],
    ['review_join', { outcome: 'blocked', next: 'blocked', blocker: { summary: 'Join blocked.', source_step_id: 'review_join', needed: 'All review outputs.' } }],
  ];

  for (const [stepId, output] of blockedCases) {
    const result = validateAgainstOutputSchema({
      workflow: workflowDoc,
      workflowPath,
      schemaRef: workflowDoc.steps[stepId].output.schema,
      repositoryRoot: REPO_ROOT,
      output,
    });
    assert.equal(result.ok, true, `${stepId} should accept blocked output without success payloads: ${result.errors}`);
  }
});



test('dev harness planning draft always requires selected review steps', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json');
  const result = validateAgainstOutputSchema({
    workflow: workflowDoc,
    workflowPath,
    schemaRef: workflowDoc.steps.planning_draft.output.schema,
    repositoryRoot: REPO_ROOT,
    output: { outcome: 'blocked', blocker: { summary: 'Cannot plan.', source_step_id: 'planning_draft', needed: 'Approved scope.' } },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors, /selected_review_steps/);
});


test('dev harness review join schema keeps outcome and next route consistent', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json');
  const schemaContext = {
    workflow: workflowDoc,
    workflowPath,
    schemaRef: workflowDoc.steps.review_join.output.schema,
    repositoryRoot: REPO_ROOT,
  };
  const passedVerdict = {
    summary: ['Joined review.'],
    selected_review_steps: ['backend_review'],
    failed_review_steps: [],
  };
  const needsChangesVerdict = {
    ...passedVerdict,
    failed_review_steps: ['backend_review'],
    required_implementation_steps: ['backend_implementation'],
  };
  const needsChangesWithoutTargets = {
    ...passedVerdict,
    failed_review_steps: ['backend_review'],
  };
  const needsChangesWithEmptyTargets = {
    ...needsChangesWithoutTargets,
    required_implementation_steps: [],
  };

  assert.equal(validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'needs_changes', verdict: needsChangesVerdict, next: ['backend_implementation'] } }).ok, true);
  assert.equal(validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'needs_changes', verdict: needsChangesWithoutTargets, next: ['backend_implementation'] } }).ok, false);
  assert.equal(validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'needs_changes', verdict: needsChangesWithEmptyTargets, next: ['backend_implementation'] } }).ok, false);
  assert.equal(validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'needs_changes', verdict: needsChangesVerdict, next: 'done' } }).ok, false);
  assert.equal(validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'passed', verdict: passedVerdict, next: ['backend_implementation'] } }).ok, false);
  assert.equal(validateAgainstOutputSchema({ ...schemaContext, output: { outcome: 'passed', verdict: passedVerdict, next: 'done' } }).ok, true);
  assert.equal(validateAgainstOutputSchema({
    ...schemaContext,
    output: { outcome: 'blocked', blocker: { summary: 'Blocked.', source_step_id: 'review_join', needed: 'Missing review.' }, next: ['backend_implementation'] },
  }).ok, false);
  assert.equal(validateAgainstOutputSchema({
    ...schemaContext,
    output: { outcome: 'blocked', blocker: { summary: 'Blocked.', source_step_id: 'review_join', needed: 'Missing review.' }, next: 'blocked' },
  }).ok, true);
});

test('dev harness review gates reject needs_changes without a rework target', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json');
  const output = {
    outcome: 'needs_changes',
    verdict: { summary: ['Needs work.'], evidence_checked: ['diff'], findings: [{ summary: 'Bug.' }] },
    required_implementation_steps: [],
  };

  const result = validateAgainstOutputSchema({
    workflow: workflowDoc,
    workflowPath,
    schemaRef: workflowDoc.steps.backend_review.output.schema,
    repositoryRoot: REPO_ROOT,
    output,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors, /required_implementation_steps/);
});

test('dev harness success outputs still require their success payloads', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json');
  for (const [stepId, output, missingField] of [
    ['research_draft', { outcome: 'ready_for_attack' }, 'research_packet'],
    ['planning_draft', { outcome: 'ready_for_attack' }, 'implementation_plan'],
    ['implementation_join', { outcome: 'ready_for_review' }, 'reviewer_handoff'],
    ['review_join', { outcome: 'passed' }, 'verdict'],
  ]) {
    const result = validateAgainstOutputSchema({
      workflow: workflowDoc,
      workflowPath,
      schemaRef: workflowDoc.steps[stepId].output.schema,
      repositoryRoot: REPO_ROOT,
      output,
    });
    assert.equal(result.ok, false, `${stepId} should reject success without ${missingField}`);
    assert.match(result.errors, new RegExp(missingField));
  }
});



test('validateWorkflowFile derives the role repository root from the workflow path', () => {
  const projectRoot = path.join(tempDir, 'external-role-project');
  const workflowDir = path.join(projectRoot, 'workflows', 'role-fixture');
  const roleDir = path.join(projectRoot, 'roles', 'external-reviewer');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(path.join(roleDir, 'ROLE.md'), '# External reviewer role\n');
  writeFileSync(path.join(roleDir, 'RUBRIC.md'), '# External reviewer rubric\n');
  const workflowPath = path.join(workflowDir, 'workflow.json');
  const doc = genericWorkflowWithWorkerRole('external-reviewer');
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);

  assert.deepEqual(validateWorkflowFile(workflowPath), {
    ok: true,
    workflow: 'generic-role-validation-fixture',
    steps: Object.keys(doc.steps).length,
  });
});


test('validateWorkflowFile rejects worker roles when loaded role catalog is empty', () => {
  const projectRoot = path.join(tempDir, 'empty-role-catalog-project');
  const workflowDir = path.join(projectRoot, 'workflows', 'role-fixture');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(path.join(projectRoot, 'roles'), { recursive: true });
  const workflowPath = path.join(workflowDir, 'workflow.json');
  writeFileSync(workflowPath, `${JSON.stringify(genericWorkflowWithWorkerRole('missing-role'), null, 2)}\n`);

  assert.throws(() => validateWorkflowFile(workflowPath), /step 'worker_step' input\.role 'missing-role' is not an allowed role/);
});

test('workflow semantic validation rejects invalid worker roles in generic workflows', () => {
  const doc = genericWorkflowWithWorkerRole('missing-workflow-role');

  assert.throws(() => validate(doc), /step 'worker_step' input\.role 'missing-workflow-role' is not an allowed role/);
});

test('workflow semantic validation rejects step ids reserved for baton state bookkeeping', () => {
  for (const reservedStepId of ['artifacts', 'results', 'outputs', 'attempts']) {
    const doc = genericWorkflowWithWorkerRole('backend');
    doc.start = reservedStepId;
    doc.steps[reservedStepId] = {
      ...doc.steps.worker_step,
      name: `Reserved ${reservedStepId}`,
    };
    delete doc.steps.worker_step;

    assertSemanticFailure(doc, new RegExp(`workflow step id '${reservedStepId}' is reserved for runtime aggregate state`));
  }
});

test('workflow semantic validation rejects step ids unsafe as JavaScript object keys', () => {
  for (const reservedStepId of ['prototype', 'constructor']) {
    const doc = genericWorkflowWithWorkerRole('backend');
    doc.start = reservedStepId;
    doc.steps[reservedStepId] = {
      ...doc.steps.worker_step,
      name: `Reserved ${reservedStepId}`,
    };
    delete doc.steps.worker_step;

    assertSemanticFailure(doc, new RegExp(`workflow step id '${reservedStepId}'.*unsafe as a JavaScript object key`));
  }
});

test('workflow semantic validation warns when DevHarness described fields lack x-usage', () => {
  const doc = structuredClone(workflowDoc);
  cpSync(path.join(REPO_ROOT, 'skills/orbita/lib/tests/fixtures/research-draft-missing-x-usage.schema.json'), path.join(tempDir, 'schemas/research-draft-missing-x-usage.schema.json'));
  doc.steps.research_draft.output.schema = 'schemas/research-draft-missing-x-usage.schema.json';

  const result = validateSynthetic(doc);

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /research_packet\.scope.*no x-usage/);
});

test('workflow semantic validation rejects optional output paths used for routing expressions', () => {
  writeSchema('optional-route-output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { enum: ['ready', 'blocked'] },
      route: { enum: ['done', 'blocked'] },
    },
    additionalProperties: false,
  });

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.output.schema = 'optional-route-output.schema.json';
      draft.steps.producer.next = '${{ output.route }}';
      return draft;
    }),
    /producer.*next expression \$\{\{ output\.route \}\}.*required output\.schema path/,
  );
});

test('workflow semantic validation rejects worker output schemas that do not require string outcome', () => {
  writeSchema('missing-outcome-output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['summary'],
    properties: { summary: { type: 'string' } },
    additionalProperties: false,
  });
  writeSchema('numeric-outcome-output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { enum: ['ready', 1] } },
    additionalProperties: false,
  });

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.output.schema = 'missing-outcome-output.schema.json';
      draft.steps.producer.next = 'done';
      return draft;
    }),
    /producer.*output\.schema must require string field 'outcome'/,
  );

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.output.schema = 'numeric-outcome-output.schema.json';
      draft.steps.producer.next = 'done';
      return draft;
    }),
    /producer.*output\.schema field 'outcome' must allow only strings/,
  );
});

test('workflow semantic validation normalizes local refs before semantic introspection', () => {
  writeSchema('ref-outcome-output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    allOf: [{ $ref: '#/$defs/contract' }],
    $defs: {
      contract: {
        type: 'object',
        required: ['outcome', 'route', 'next_steps'],
        properties: {
          outcome: { $ref: '#/$defs/outcome' },
          route: { $ref: '#/$defs/route' },
          next_steps: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { $ref: '#/$defs/branch' },
          },
        },
        additionalProperties: false,
      },
      outcome: { type: 'string', enum: ['ready', 'blocked'] },
      route: { type: 'string', enum: ['consumer', 'blocked'] },
      branch: { type: 'string', enum: ['branch_a', 'branch_b'] },
    },
  });

  const dynamicTargetDoc = syntheticWorkflow((draft) => {
    draft.steps.producer.output.schema = 'ref-outcome-output.schema.json';
    draft.steps.producer.next = '${{ output.route }}';
    return draft;
  });
  assert.deepEqual(validateSynthetic(dynamicTargetDoc), { ok: true, workflow: 'synthetic-validation-fixture', steps: 7 });

  const matchDoc = syntheticWorkflow((draft) => {
    draft.steps.producer.output.schema = 'ref-outcome-output.schema.json';
    draft.steps.producer.next = { match: '${{ output.outcome }}', cases: { ready: 'consumer', blocked: 'blocked' } };
    return draft;
  });
  assert.deepEqual(validateSynthetic(matchDoc), { ok: true, workflow: 'synthetic-validation-fixture', steps: 7 });
});

test('workflow semantic validation rejects schema-declared dynamic targets that are not workflow steps', () => {
  const doc = structuredClone(workflowDoc);
  cpSync(path.join(REPO_ROOT, 'skills/orbita/lib/tests/fixtures/review-join-output-unknown-target.schema.json'), path.join(tempDir, 'schemas/review-join-output-unknown-target.schema.json'));
  doc.steps.review_join.output.schema = 'schemas/review-join-output-unknown-target.schema.json';

  assertSemanticFailure(doc, /review_join.*output\.next.*unknown_step/);
});

test('workflow semantic validation rejects missing match cases from output schema enums', () => {
  const doc = structuredClone(workflowDoc);
  delete doc.steps.research_draft.next.cases.blocked;

  assertSemanticFailure(doc, /research_draft.*next\.cases is missing schema-declared case 'blocked'/);
});

test('workflow semantic validation rejects unreachable match cases not present in output schema enums', () => {
  const doc = structuredClone(workflowDoc);
  doc.steps.research_draft.next.cases.unreachable = 'blocked';

  assert.throws(() => validate(doc), /research_draft.*unreachable case 'unreachable'/);
});

test('workflow semantic validation rejects malformed workflow names', () => {
  const doc = syntheticWorkflow((draft) => {
    draft.name = '../not-a-workflow-name';
    return draft;
  });

  assertSemanticFailure(doc, /workflow name must be a non-empty lowercase kebab-case identifier/);
});

test('workflow semantic validation accepts input.state selectors that reference declared workflow step ids', () => {
  assert.deepEqual(validateSynthetic(syntheticWorkflow()), { ok: true, workflow: 'synthetic-validation-fixture', steps: 7 });

  const doc = syntheticWorkflow((draft) => {
    draft.steps.approval_gate = {
      name: 'Approval gate',
      kind: 'approval',
      next: { match: '${{ output.approval }}', cases: { approved: 'consumer', blocked: 'blocked' } },
    };
    draft.steps.consumer.input.state = ['approval_gate'];
    return draft;
  });

  assert.deepEqual(validateSynthetic(doc), { ok: true, workflow: 'synthetic-validation-fixture', steps: 8 });
});

test('workflow semantic validation rejects optional input paths used for dynamic routing expressions', () => {
  writeSchema('optional-input-route-output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { enum: ['ready'] },
      route: { enum: ['done'] },
    },
    additionalProperties: false,
  });

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.output.schema = 'optional-input-route-output.schema.json';
      draft.steps.producer.next = 'consumer';
      draft.steps.consumer.next = '${{ input.producer.route }}';
      return draft;
    }),
    /consumer.*next expression \$\{\{ input\.producer\.route \}\}.*required output\.schema path/,
  );
});

test('workflow semantic validation rejects optional input paths used for match routing expressions', () => {
  writeSchema('optional-input-match-output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { enum: ['ready'] },
      route: { enum: ['done', 'blocked'] },
    },
    additionalProperties: false,
  });

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.output.schema = 'optional-input-match-output.schema.json';
      draft.steps.producer.next = 'consumer';
      draft.steps.consumer.next = { match: '${{ input.producer.route }}', cases: { done: 'done', blocked: 'blocked' } };
      return draft;
    }),
    /consumer.*next\.match expression \$\{\{ input\.producer\.route \}\}.*required output\.schema path/,
  );
});

test('workflow semantic validation accepts input expressions against projected input.state selectors', () => {
  const doc = syntheticWorkflow((draft) => {
    draft.steps.consumer.input = { state: ['producer', 'branch_a'] };
    draft.steps.consumer.next = { match: '${{ input.branch_a.outcome }}', cases: { ready: 'done', blocked: 'blocked' } };
    return draft;
  });

  assert.deepEqual(validateSynthetic(doc), { ok: true, workflow: 'synthetic-validation-fixture', steps: 7 });
});

test('workflow semantic validation rejects input.state selectors that do not name own workflow step ids', () => {
  for (const selector of ['missing_step', 'toString']) {
    assertSemanticFailure(
      syntheticWorkflow((draft) => {
        draft.steps.consumer.input.state = [selector];
        return draft;
      }),
      new RegExp(`consumer.*input\\.state selector '${selector}'.*declared workflow step`),
    );
  }

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.input.state = ['artifacts', 'results', 'outputs'];
      return draft;
    }),
    /consumer.*input\.state selector 'artifacts'.*reserved for runtime aggregate state/,
  );


  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.input.state = ['__proto__'];
      return draft;
    }),
    /consumer.*input\.state selector '__proto__'.*unsafe as a JavaScript object key/,
  );
});

test('workflow semantic validation rejects declared step ids reserved for aggregate runtime state', () => {
  for (const reservedStepId of ['artifacts', 'results', 'outputs', 'attempts']) {
    assertSemanticFailure(
      syntheticWorkflow((draft) => {
        draft.steps[reservedStepId] = {
          name: `Reserved ${reservedStepId}`,
          kind: 'worker',
          output: { template: `${reservedStepId}.md`, schema: 'route-output.schema.json' },
          next: 'done',
        };
        return draft;
      }),
      new RegExp(`workflow step id '${reservedStepId}'.*reserved for runtime aggregate state`),
    );
  }
});

test('workflow semantic validation rejects unsupported nested input.state selectors', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.input.state = ['producer.route'];
      return draft;
    }),
    /consumer.*input\.state selector 'producer\.route' is invalid/,
  );
});

test('workflow semantic validation rejects projected input expressions with unknown schema fields', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.next = { match: '${{ input.producer.missing_route }}', cases: { review: 'done', blocked: 'blocked' } };
      return draft;
    }),
    /consumer.*input\.producer\.missing_route.*no schema-covered path/,
  );
});

test('workflow semantic validation rejects aggregate runtime state expressions in input transitions', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.next = { match: '${{ input.outputs.producer.route }}', cases: { review: 'done', blocked: 'blocked' } };
      return draft;
    }),
    /consumer.*input\.outputs\.producer\.route.*does not project input state 'outputs'/,
  );
});

test('workflow semantic validation rejects unsafe dynamic array target schemas', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.next = '${{ output.next_steps }}';
      draft.steps.producer.output.schema = 'bad-array-output.schema.json';
      return draft;
    }),
    /producer.*output\.next_steps.*array target schema must declare minItems >= 1/,
  );

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.next = '${{ output.next_steps }}';
      draft.steps.producer.output.schema = 'unknown-array-target-output.schema.json';
      return draft;
    }),
    /producer.*output\.next_steps.*target not found: missing_branch/,
  );
});

test('workflow semantic validation rejects mixed static and dynamic parallel targets with invalid combined join shape', () => {
  writeSchema('selected-branch-output.schema.json', {
    ...routeSchema,
    required: ['outcome', 'route', 'next_steps', 'selected'],
    properties: {
      ...routeSchema.properties,
      selected: { enum: ['branch_b'] },
    },
  });

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.output.schema = 'selected-branch-output.schema.json';
      draft.steps.producer.next = ['branch_a', '${{ output.selected }}'];
      draft.steps.branch_a.next = 'consumer';
      draft.steps.branch_b.next = 'join';
      return draft;
    }),
    /producer.*combined parallel targets are invalid.*share one explicit join step/,
  );
});

test('workflow semantic validation rejects dynamic array target schemas with invalid join shape', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.next = '${{ output.next_steps }}';
      draft.steps.branch_b.next = 'done';
      return draft;
    }),
    /producer.*output\.next_steps.*parallel branch targets must share one explicit join step/,
  );
});


test('validateWorkflowFile rejects a missing workflow path with a controlled error', () => {
  assert.throws(() => validateWorkflowFile(''), /workflow path is required/);
});

test('validate-workflow CLI requires an explicit workflow path', () => {
  const result = runNode(['skills/orbita/lib/entrypoints/cli/validate-workflow.mjs']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /validate-workflow: workflow path is required/);
});

test('workflow semantic validation uses approval output.schema for output match cases when declared', () => {
  cpSync(path.join(REPO_ROOT, 'skills/orbita/lib/tests/fixtures/approval-choice-output.schema.json'), path.join(tempDir, 'approval-choice-output.schema.json'));
  const doc = {
      name: 'approval-schema-routing-fixture',
      version: 1,
      start: 'approve',
      done: 'done',
      blocked: 'blocked',
      steps: {
        approve: {
          name: 'Approve',
          kind: 'approval',
          input: { prompt: 'Choose ship or revise.' },
          output: { schema: 'approval-choice-output.schema.json' },
          next: { match: '${{ output.choice }}', cases: { ship: 'done' } },
        },
        done: { name: 'Done', kind: 'done' },
        blocked: { name: 'Blocked', kind: 'blocked' },
      },

  };

  assertSemanticFailure(doc, /approve.*next\.cases is missing schema-declared case 'revise'/);
});
