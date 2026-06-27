import assert from 'node:assert/strict';
import test from 'node:test';
import { Baton } from '../entities/Baton/index.mjs';
import {
  assertNoNestedMatchCasesTarget,
  isDynamicTransitionNext,
  isStaticParallelNext,
  normalizeTransitionNext,
} from '../runtime/transition-next.mjs';
import { Workflow } from '../entities/Workflow/index.mjs';
import { WorkflowDTO } from '../dtos/WorkflowDTO.mjs';
import { WorkflowRuntimeError } from '../errors.mjs';
import { applyOutputToBatonState } from '../runtime/baton-state.mjs';
import { applyWorkflowOutput } from '../use-cases/ApplyWorkflowOutput.mjs';
import { inspectWorkflow } from '../use-cases/InspectWorkflow.mjs';
import { validateWorkflow } from '../use-cases/ValidateWorkflow.mjs';
import { Step } from '../entities/Step/index.mjs';

const routeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome', 'route', 'targets'],
  properties: {
    outcome: { type: 'string' },
    route: { enum: ['direct', 'split', 'blocked'] },
    targets: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: ['branch_a', 'branch_b'] },
    },
    artifacts: { type: 'array', items: { type: 'object' } },
    results: { type: 'array', items: { type: 'object' } },
    blocker: { type: 'object' },
  },
  additionalProperties: false,
};

const branchSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'object' } },
    results: { type: 'array', items: { type: 'object' } },
    blocker: { type: 'object' },
  },
  additionalProperties: false,
};

const outputSchemas = new Map([
  ['route.schema.json', routeSchema],
  ['branch.schema.json', branchSchema],
]);

function workflowDoc(overrides = (workflow) => workflow) {
  const workflow = {
    name: 'cycle-two-fixture',
    version: 1,
    start: 'producer',
    done: 'done',
    blocked: 'blocked',
    steps: {
      producer: {
        name: 'Producer',
        kind: 'worker',
        input: { role: 'backend' },
        output: { template: 'producer.md', schema: 'route.schema.json' },
        next: { match: '${{ output.route }}', cases: { direct: 'done', split: ['branch_a', 'branch_b'], blocked: 'blocked' } },
      },
      branch_a: { name: 'Branch A', kind: 'worker', output: { template: 'branch-a.md', schema: 'branch.schema.json' }, next: 'join' },
      branch_b: { name: 'Branch B', kind: 'worker', output: { template: 'branch-b.md', schema: 'branch.schema.json' }, next: 'join' },
      join: { name: 'Join', kind: 'worker', output: { template: 'join.md' }, next: 'done' },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };
  return overrides(workflow) ?? workflow;
}

function batonDoc(overrides = {}) {
  return {
    cursor: 'producer',
    status: 'running',
    state: { artifacts: [], results: [] },
    ...overrides,
  };
}

function validate(doc, options = {}) {
  return new Workflow(doc).validate({ outputSchemas, allowedRoles: { loaded: true, names: ['backend'] }, ...options });
}

function assertWorkflowError(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof WorkflowRuntimeError, true);
    assert.match(error.message, pattern);
    return true;
  });
}

test('Baton constructor clones boundary data before freezing internal state', () => {
  const source = batonDoc();
  const baton = new Baton(source);
  source.state.artifacts.push({ id: 'late', content_type: 'text/plain', path: '/runs/producer/artifacts/late.txt' });

  assert.deepEqual(baton.toJSON().state.artifacts, []);
});

test('Baton.toJSON returns a defensive clone that callers cannot mutate back into the entity', () => {
  const baton = new Baton(batonDoc());
  const json = baton.toJSON();
  json.state.results.push({ type: 'mutated' });

  assert.deepEqual(baton.toJSON().state.results, []);
});

test('Baton.validateAgainst rejects missing object runtime state', () => {
  assertWorkflowError(() => new Baton({ cursor: 'producer', status: 'running', state: null }).validateAgainst(workflowDoc()), /baton requires cursor, status, and object state/);
});

test('Baton.validateAgainst rejects cursor status that does not match the workflow terminal kind', () => {
  assertWorkflowError(() => new Baton(batonDoc({ cursor: 'done', status: 'running' })).validateAgainst(workflowDoc()), /status 'running' is inconsistent with cursor 'done'; expected 'done'/);
});

test('Baton.validateAgainst accepts a terminal done cursor with done status', () => {
  assert.deepEqual(new Baton(batonDoc({ cursor: 'done', status: 'done' })).validateAgainst(workflowDoc()), { ok: true });
});

test('Baton.withAppliedOutput replaces existing artifacts by id and preserves unrelated artifacts', () => {
  const baton = new Baton(batonDoc({ state: { artifacts: [
    { producerStepId: 'producer', artifact: { id: 'same', content_type: 'text/markdown', path: '/runs/producer/artifacts/same.md', summary: 'old' } },
    { producerStepId: 'producer', artifact: { id: 'keep', content_type: 'text/markdown', path: '/runs/producer/artifacts/keep.md', summary: 'keep' } },
  ], results: [] } }));
  const next = baton.withAppliedOutput('producer', { outcome: 'ready', artifacts: [{ id: 'same', content_type: 'text/markdown', path: '/runs/producer/artifacts/same.md', summary: 'new' }], results: [] });

  assert.deepEqual(next.state.artifacts, [
    { producerStepId: 'producer', artifact: { id: 'same', content_type: 'text/markdown', path: '/runs/producer/artifacts/same.md', summary: 'new' } },
    { producerStepId: 'producer', artifact: { id: 'keep', content_type: 'text/markdown', path: '/runs/producer/artifacts/keep.md', summary: 'keep' } },
  ]);
});

test('Baton.withAppliedOutput appends result aggregates without overwriting previous results', () => {
  const baton = new Baton(batonDoc({ state: { artifacts: [], results: [{ type: 'previous' }] } }));
  const next = baton.withAppliedOutput('producer', { outcome: 'ready', artifacts: [], results: [{ type: 'current' }] });

  assert.deepEqual(next.state.results, [{ type: 'previous' }, { type: 'current' }]);
});

test('Baton.withAppliedOutput rejects non-array artifact aggregates before mutating state', () => {
  const baton = new Baton(batonDoc());
  assertWorkflowError(() => baton.withAppliedOutput('producer', { outcome: 'ready', artifacts: {}, results: [] }), /worker output failed schema validation: \/artifacts must be array/);
});

test('applyOutputToBatonState rejects artifact output when producer step id is missing', () => {
  assertWorkflowError(
    () => applyOutputToBatonState(batonDoc(), { artifacts: [{ id: 'a', content_type: 'text/markdown', path: '/runs/producer/artifacts/a.md' }], results: [] }, undefined, undefined),
    /cannot determine producerStepId.*pass stepId/,
  );
});

test('Baton.withAppliedOutput mirrors schema-backed step output into state.outputs when requested', () => {
  const next = new Baton(batonDoc()).withAppliedOutput('producer', { outcome: 'ok', artifacts: [], results: [] }, undefined, { mirrorToOutputs: true });

  assert.deepEqual(next.state.outputs.producer, { outcome: 'ok', artifacts: [], results: [] });
});

test('normalizeTransitionNext classifies static arrays as static parallel transitions', () => {
  assert.equal(normalizeTransitionNext(['branch_a', 'branch_b']).kind, 'static-parallel');
  assert.equal(isStaticParallelNext(['branch_a', 'branch_b']), true);
});

test('isDynamicTransitionNext treats mixed top-level transition arrays as dynamic parallel items', () => {
  assert.equal(isDynamicTransitionNext(['branch_a', '${{ output.targets }}']), true);
});

test('assertNoNestedMatchCasesTarget rejects nested match/cases objects inside parallel cases', () => {
  assertWorkflowError(() => assertNoNestedMatchCasesTarget([{ match: '${{ output.route }}', cases: { direct: 'done' } }], 'next.cases.split'), /nested match\/cases transitions are not supported at next\.cases\.split\.0/);
});

test('Step.resolveConcreteTargets rejects approval outputs that use worker outcome fields', () => {
  const step = new Step({ id: 'approve', step: { name: 'Approve', kind: 'approval', next: 'done' } });
  assertWorkflowError(() => step.resolveConcreteTargets(batonDoc({ cursor: 'approve' }), workflowDoc((workflow) => {
    workflow.steps.approve = { name: 'Approve', kind: 'approval', next: 'done' };
    return workflow;
  }), { outcome: 'ready' }), /approval cursor 'approve' must use host\/user output fields, not outcome/);
});

test('Step.resolveConcreteTargets rejects worker outputs that use approval fields', () => {
  const step = new Step({ id: 'producer', step: workflowDoc().steps.producer });
  assertWorkflowError(() => step.resolveConcreteTargets(batonDoc(), workflowDoc(), { approval: 'approved' }), /worker cursor 'producer' must use outcome, not approval/);
});

test('Step.resolveConcreteTargets rejects undefined match/cases keys at runtime', () => {
  const step = new Step({ id: 'producer', step: workflowDoc().steps.producer });
  assertWorkflowError(() => step.resolveConcreteTargets(batonDoc(), workflowDoc(), { outcome: 'ok', route: 'missing', targets: ['branch_a'] }), /next\.match case 'missing' is not defined in next\.cases/);
});

test('Step.resolveConcreteTargets resolves dynamic parallel array output into targetStepIds', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.producer.next = '${{ output.targets }}';
    return workflow;
  });
  const step = new Step({ id: 'producer', step: doc.steps.producer });

  assert.deepEqual(step.resolveConcreteTargets(batonDoc(), doc, { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] }), { targetStepIds: ['branch_a', 'branch_b'] });
});

test('Step.resolveInputs projects only requested state keys and returns diagnostics shape', () => {
  const step = new Step({ id: 'join', step: { name: 'Join', kind: 'worker', input: { state: ['branch_a'] }, next: 'done' } });

  assert.deepEqual(step.resolveInputs({ state: { branch_a: { outcome: 'ok' }, branch_b: { outcome: 'skip' } } }), { branch_a: { outcome: 'ok' } });
});

test('Step.applyOutput carries a blocker object when a worker transitions to the blocked terminal', () => {
  const step = new Step({ id: 'producer', step: workflowDoc().steps.producer });
  const applied = step.applyOutput({ workflow: workflowDoc(), baton: batonDoc(), output: { outcome: 'blocked', route: 'blocked', targets: ['branch_a'], blocker: { reason: 'no access' } } });

  assert.equal(applied.baton.cursor, 'blocked');
  assert.equal(applied.baton.status, 'blocked');
  assert.deepEqual(applied.baton.blocker, { reason: 'no access' });
});

test('Step.applyOutput clears a stale blocker when a later transition reaches a non-blocked status', () => {
  const step = new Step({ id: 'producer', step: workflowDoc().steps.producer });
  const applied = step.applyOutput({ workflow: workflowDoc(), baton: batonDoc({ blocker: { reason: 'old' } }), output: { outcome: 'ok', route: 'direct', targets: ['branch_a'] } });

  assert.equal(applied.baton.status, 'done');
  assert.equal(Object.hasOwn(applied.baton, 'blocker'), false);
});

test('Step.validateInstructionRequest accepts a requested branch reached by a stored parallel output', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.producer.next = '${{ output.targets }}';
    return workflow;
  });
  const step = new Step({ id: 'producer', step: doc.steps.producer });
  const baton = batonDoc({ state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] } } });

  assert.deepEqual(step.validateInstructionRequest({ workflow: doc, baton, runState: { requests: [{ stepId: 'branch_b' }] }, stepId: 'branch_b' }), { ok: true, stepId: 'branch_b' });
});

test('Step.validateInstructionRequest rejects unknown current request ids', () => {
  const step = new Step({ id: 'producer', step: workflowDoc().steps.producer });
  assert.throws(() => step.validateInstructionRequest({ workflow: workflowDoc(), baton: batonDoc(), runState: { requests: [] }, stepId: 'missing' }), /stale workflow-runner command from an older response: requested step 'missing'.*current request step ids: none/);
});

test('Workflow constructor clones boundary data before exposing steps', () => {
  const source = workflowDoc();
  const workflow = new Workflow(source);
  source.steps.added = { name: 'Added', kind: 'worker', next: 'done' };

  assert.equal(workflow.hasStep('added'), false);
});

test('Workflow.getStep rejects missing steps instead of returning undefined', () => {
  assertWorkflowError(() => new Workflow(workflowDoc()).getStep('missing'), /workflow step not found: missing/);
});

test('Workflow.statusForStep reports terminal done status from workflow topology', () => {
  assert.equal(new Workflow(workflowDoc()).statusForStep('done'), 'done');
});

test('Workflow.inferStep rejects batons whose cursor is not declared by the workflow', () => {
  assertWorkflowError(() => new Workflow(workflowDoc()).inferStep(batonDoc({ cursor: 'missing' })), /baton cursor not found in workflow: missing/);
});

test('Workflow.validateStaticTransitions rejects static targets that are not declared', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.join.next = 'missing';
    return workflow;
  });
  assertWorkflowError(() => new Workflow(doc).validateStaticTransitions(), /transition 'next' target not found: missing/);
});

test('Workflow.validateOutputSchemas returns external-schema field annotation warnings without failing validation', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.producer.output.schema = 'external.schema.json';
    workflow.steps.producer.next = 'done';
    return workflow;
  });
  const externalSchema = {
    $id: 'https://example.test/schemas/workflow/dev-harness/external.schema.json',
    type: 'object',
    required: ['outcome', 'summary'],
    properties: { outcome: { type: 'string' }, summary: { type: 'string', description: 'Reviewer summary.' } },
  };

  assert.deepEqual(new Workflow(doc).validateOutputSchemas(new Map([['external.schema.json', externalSchema], ['branch.schema.json', branchSchema]])).warnings, [
    "output.schema 'external.schema.json' field 'summary' has description but no x-usage receiver instruction",
  ]);
});

test('Workflow.validate permits missing output schemas when schema presence is explicitly disabled and transitions are static', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.producer.next = 'done';
    return workflow;
  });

  assert.deepEqual(validate(doc, { outputSchemas: new Map(), requireSchemaPresence: false }), { ok: true, workflow: 'cycle-two-fixture', steps: Object.keys(doc.steps).length });
});

test('Workflow.validate rejects reserved aggregate ids as workflow step ids', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.results = { name: 'Reserved', kind: 'worker', next: 'done' };
    return workflow;
  });

  assertWorkflowError(() => validate(doc), /workflow step id 'results' is reserved for runtime aggregate state/);
});

test('Workflow.validate rejects unsafe JavaScript object-key ids as workflow step ids', () => {
  const doc = workflowDoc((workflow) => {
    Object.defineProperty(workflow.steps, '__proto__', { value: { name: 'Unsafe', kind: 'worker', next: 'done' }, enumerable: true, configurable: true });
    return workflow;
  });

  assertWorkflowError(() => validate(doc), /workflow step id '__proto__' is reserved because it is unsafe as a JavaScript object key/);
});

test('ValidateWorkflow wraps document schema failures in WorkflowRuntimeError', () => {
  assertWorkflowError(() => validateWorkflow({ workflowDTO: { version: 1 } }), /workflow failed schema validation/);
});

test('ValidateWorkflow accepts WorkflowDTO boundaries and returns a cloneable result DTO', () => {
  const doc = workflowDoc((workflow) => {
    workflow.steps.producer.next = 'done';
    return workflow;
  });
  const result = validateWorkflow({ workflowDTO: new WorkflowDTO(doc), outputSchemas, allowedRoles: { loaded: true, names: ['backend'] } }).toJSON();

  assert.deepEqual(result, { ok: true, workflow: 'cycle-two-fixture', steps: Object.keys(doc.steps).length });
});

test('inspectWorkflow exposes the cursor step when no parallel output has been prepared', () => {
  const response = inspectWorkflow({ workflowDoc: workflowDoc(), batonDoc: batonDoc(), resources: { outputSchemas } });

  assert.deepEqual(response.steps.map((step) => step.id), ['producer']);
});

test('applyWorkflowOutput prepares dynamic parallel branches from a JSON string output', () => {
  const response = applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: batonDoc(), resources: { outputSchemas }, outputContent: JSON.stringify({ outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] }) });

  assert.equal(response.baton.cursor, 'producer');
  assert.deepEqual(response.baton.state.producer.targets, ['branch_a', 'branch_b']);
  assert.deepEqual(response.steps.map((step) => step.id), ['branch_a', 'branch_b']);
});

test('inspectWorkflow resolves stored dynamic parallel output into branch step responses', () => {
  const response = inspectWorkflow({
    workflowDoc: workflowDoc(),
    batonDoc: batonDoc({ state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] } } }),
    resources: { outputSchemas },
  });

  assert.deepEqual(response.steps.map((step) => step.id), ['branch_a', 'branch_b']);
});

test('applyWorkflowOutput rejects prepared parallel applications without the steps envelope', () => {
  const baton = batonDoc({ state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] } } });

  assert.throws(() => applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: baton, resources: { outputSchemas }, outputValue: { branch_a: { outcome: 'ok' } } }), /parallel output must include object steps/);
});

test('applyWorkflowOutput rejects prepared parallel output that omits one selected target', () => {
  const baton = batonDoc({ state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] } } });

  assert.throws(() => applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: baton, resources: { outputSchemas }, outputValue: { steps: { branch_a: { outcome: 'ok' } } } }), /parallel output missing step 'branch_b'/);
});

test('applyWorkflowOutput rejects prepared parallel output that includes an unexpected branch', () => {
  const baton = batonDoc({ state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] } } });

  assert.throws(() => applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: baton, resources: { outputSchemas }, outputValue: { steps: { branch_a: { outcome: 'ok' }, branch_b: { outcome: 'ok' }, extra: { outcome: 'ok' } } } }), /parallel output included unexpected step 'extra'/);
});

test('applyWorkflowOutput applies all prepared parallel outputs and advances to the shared join step', () => {
  const baton = batonDoc({ state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split', targets: ['branch_a', 'branch_b'] } } });
  const response = applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: baton, resources: { outputSchemas }, outputValue: { steps: { branch_a: { outcome: 'ok' }, branch_b: { outcome: 'ok' } } } });

  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.baton.status, 'running');
  assert.deepEqual(response.baton.state.branch_a, { outcome: 'ok' });
  assert.deepEqual(response.baton.state.branch_b, { outcome: 'ok' });
});

test('applyWorkflowOutput returns a retry response for invalid JSON when a cursor declares output schema', () => {
  const response = applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: batonDoc(), resources: { outputSchemas }, outputContent: '{not json' });

  assert.equal(response.baton.cursor, 'producer');
  assert.equal(response.baton.state.attempts['producer:output.schema'], 1);
  assert.match(response.steps[0].step.input.prompt, /step output is not valid JSON/);
});

test('applyWorkflowOutput throws after the final output schema retry attempt is exhausted', () => {
  const baton = batonDoc({ state: { artifacts: [], results: [], attempts: { 'producer:output.schema': 2 } } });

  assertWorkflowError(() => applyWorkflowOutput({ workflowDoc: workflowDoc(), batonDoc: baton, resources: { outputSchemas }, outputValue: { outcome: 42, route: 'direct', targets: ['branch_a'] } }), /output schema validation failed for step 'producer' after 3 attempts/);
});

test('applyWorkflowOutput validates generic approval output shape when no approval schema is declared', () => {
  const doc = workflowDoc((workflow) => {
    workflow.start = 'approve';
    workflow.steps.approve = { name: 'Approve', kind: 'approval', next: 'done' };
    return workflow;
  });

  assertWorkflowError(() => applyWorkflowOutput({ workflowDoc: doc, batonDoc: batonDoc({ cursor: 'approve' }), resources: { outputSchemas }, outputValue: { approval: 'approved', artifacts: {} } }), /approval output failed schema validation: \/artifacts must be array/);
  assertWorkflowError(() => applyWorkflowOutput({ workflowDoc: doc, batonDoc: batonDoc({ cursor: 'approve' }), resources: { outputSchemas }, outputValue: { approval: 'approved', artifacts: [{ id: 'packet', content_type: 'text/plain', foo: 'legacy leak' }] } }), /approval output failed schema validation: \/artifacts\/0\/foo is not allowed/);
});

test('applyWorkflowOutput rejects no-schema worker artifacts with fields outside the central artifact contract', () => {
  const doc = workflowDoc((workflow) => {
    workflow.start = 'join';
    return workflow;
  });

  assert.throws(
    () => applyWorkflowOutput({ workflowDoc: doc, batonDoc: batonDoc({ cursor: 'join' }), resources: { outputSchemas }, outputValue: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/plain', foo: 'legacy leak' }] } }),
    /worker output failed schema validation|must NOT have additional properties/,
  );
});
