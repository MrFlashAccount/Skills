import assert from 'node:assert/strict';
import test from 'node:test';
import { Workflow } from '../index.mjs';
import { compileWorkflowOutputSchema } from '../schema-ref-validation.mjs';
import { assertRoleDirectoryName, isRoleDirectoryName } from '../../../runtime/role-ref.mjs';
import { assertProjectableStateSelector, isDangerousObjectKey, isReservedStateKey, isTopLevelStateSelector } from '../../../runtime/state-keys.mjs';
import { actionForStep, statusForStep } from '../../../runtime/step-status.mjs';

function workflowDoc(overrides = {}) {
  return {
    name: 'workflow-fixture',
    version: 1,
    start: 'start',
    done: 'done',
    blocked: 'blocked',
    steps: {
      start: { name: 'Start', kind: 'worker', output: { schema: 'start.schema.json' }, next: 'done' },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
    ...overrides,
  };
}

const outputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: { outcome: { type: 'string', enum: ['ok'] } },
  additionalProperties: false,
};

test('Workflow clones input and returns plain step data for start/current cursor lookups', () => {
  const doc = workflowDoc();
  const workflow = new Workflow(doc);
  doc.steps.start.next = 'blocked';

  assert.equal(workflow.getStartStep().id, 'start');
  assert.equal(workflow.getStartStep().next, 'done');
  assert.equal(workflow.inferStep({ cursor: 'start' }).id, 'start');
  assert.throws(() => workflow.getStep('missing'), /workflow step not found: missing/);
  assert.throws(() => workflow.inferStep({ cursor: 'missing' }), /baton cursor not found in workflow: missing/);
});

test('Workflow validates static transitions and reports missing targets', () => {
  assert.deepEqual(new Workflow(workflowDoc()).validateStaticTransitions(), { ok: true });

  const invalid = workflowDoc({ steps: { ...workflowDoc().steps, start: { name: 'Start', kind: 'worker', next: 'missing' } } });
  assert.throws(() => new Workflow(invalid).validateStaticTransitions(), /transition 'next' target not found: missing/);
});

test('Workflow validates parallel branches converge directly into one join step', () => {
  const valid = workflowDoc({
    steps: {
      start: { name: 'Start', kind: 'worker', next: ['branch_a', 'branch_b'] },
      branch_a: { name: 'Branch A', kind: 'worker', next: 'join' },
      branch_b: { name: 'Branch B', kind: 'worker', next: 'join' },
      join: { name: 'Join', kind: 'worker', next: 'done' },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  });

  assert.deepEqual(new Workflow(valid).validateStaticTransitions(), { ok: true });

  const missingProjection = structuredClone(valid);
  missingProjection.steps.join.input = { state: ['branch_a'] };

  assert.deepEqual(new Workflow(missingProjection).validateStaticTransitions(), { ok: true });

  const transitive = structuredClone(valid);
  transitive.steps.branch_a.next = 'branch_a2';
  transitive.steps.branch_a2 = { name: 'Branch A2', kind: 'worker', next: 'join' };

  assert.throws(
    () => new Workflow(transitive).validateStaticTransitions(),
    /parallel branch targets must share one explicit join step/,
  );

  const conditional = structuredClone(valid);
  conditional.steps.branch_a.next = { match: '${{ output.outcome }}', cases: { ok: 'join' } };

  assert.throws(
    () => new Workflow(conditional).validateStaticTransitions(),
    /parallel branch target 'branch_a' must use a string next to an explicit join step/,
  );

  const dynamicString = structuredClone(valid);
  dynamicString.steps.branch_a.next = '${{ output.next }}';
  dynamicString.steps['${{ output.next }}'] = { name: 'Literal Dynamic Step Id', kind: 'worker', next: 'join' };

  assert.throws(
    () => new Workflow(dynamicString).validateStaticTransitions(),
    /parallel branch target 'branch_a' cannot use a dynamic next before the explicit join step/,
  );

  const selfJoin = structuredClone(valid);
  selfJoin.steps.branch_a.next = 'branch_b';
  selfJoin.steps.branch_b.next = 'branch_b';

  assert.throws(
    () => new Workflow(selfJoin).validateStaticTransitions(),
    /parallel branch targets must converge on a separate explicit join step 'branch_b'/,
  );
});

test('Workflow rejects terminal steps as shared parallel branch joins', () => {
  const valid = workflowDoc({
    steps: {
      start: { name: 'Start', kind: 'worker', next: ['branch_a', 'branch_b'] },
      branch_a: { name: 'Branch A', kind: 'worker', next: 'join' },
      branch_b: { name: 'Branch B', kind: 'worker', next: 'join' },
      join: { name: 'Join', kind: 'worker', next: 'done' },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  });

  const doneJoin = structuredClone(valid);
  doneJoin.steps.branch_a.next = 'done';
  doneJoin.steps.branch_b.next = 'done';

  assert.throws(
    () => new Workflow(doneJoin).validateStaticTransitions(),
    /parallel branch targets must converge on a non-terminal join step 'done'/,
  );

  const blockedJoin = structuredClone(valid);
  blockedJoin.steps.branch_a.next = 'blocked';
  blockedJoin.steps.branch_b.next = 'blocked';

  assert.throws(
    () => new Workflow(blockedJoin).validateStaticTransitions(),
    /parallel branch targets must converge on a non-terminal join step 'blocked'/,
  );
});

test('Workflow output schema validation returns compiled schemas and worker contract errors', () => {
  const valid = new Workflow(workflowDoc()).validateOutputSchemas(new Map([['start.schema.json', outputSchema]]));

  assert.equal(valid.ok, true);
  assert.equal(valid.schemasByStep.get('start').required.includes('outcome'), true);
  assert.deepEqual(valid.warnings, []);

  assert.throws(
    () => new Workflow(workflowDoc()).validateOutputSchemas(new Map([['start.schema.json', { type: 'object', properties: {} }]])),
    /step 'start' output\.schema must require string field 'outcome'/,
  );
});

test('Workflow state-key and role-ref helpers define safe selector and role contracts', () => {
  assert.equal(isTopLevelStateSelector('review_step-2'), true);
  assert.equal(isReservedStateKey('artifacts'), true);
  assert.equal(isDangerousObjectKey('__proto__'), true);
  assert.doesNotThrow(() => assertProjectableStateSelector('review_step-2', { stepId: 'consumer' }));
  assert.throws(() => assertProjectableStateSelector('outputs', { stepId: 'consumer' }), /reserved state selector 'outputs'/);

  assert.equal(isRoleDirectoryName('backend_2'), true);
  assert.equal(isRoleDirectoryName('../backend'), false);
  assert.doesNotThrow(() => assertRoleDirectoryName('backend_2'));
  assert.throws(() => assertRoleDirectoryName('../backend'), /input.role must be a role directory name/);
});

test('Workflow status/action helpers classify worker, approval, done, and blocked steps', () => {
  const doc = workflowDoc();

  assert.equal(actionForStep({ kind: 'worker' }), 'run_worker');
  assert.equal(actionForStep({ kind: 'approval' }), 'wait_for_approval');
  assert.equal(statusForStep(doc, 'start', doc.steps.start), 'running');
  assert.equal(statusForStep(doc, 'done', doc.steps.done), 'done');
  assert.equal(statusForStep(doc, 'blocked', doc.steps.blocked), 'blocked');
});

test('compileWorkflowOutputSchema accepts external referenced schemas', () => {
  const validate = compileWorkflowOutputSchema(
    { $schema: 'https://json-schema.org/draft/2020-12/schema', $ref: 'https://example.test/output.schema.json' },
    { externalSchemas: [{ $id: 'https://example.test/output.schema.json', ...outputSchema }] },
  );

  assert.equal(validate.ok, false);
  assert.ok(Array.isArray(validate.errors));
});
