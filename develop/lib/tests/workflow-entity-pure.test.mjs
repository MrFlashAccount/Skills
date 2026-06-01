import assert from 'node:assert/strict';
import test from 'node:test';
import { Workflow } from '../entities/Workflow.mjs';
import { WorkflowRuntimeError } from '../entities/errors.mjs';

const routeOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome', 'route', 'parallel_targets'],
  properties: {
    outcome: { enum: ['ready', 'blocked'] },
    route: { enum: ['review', 'blocked'] },
    parallel_targets: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: ['branch_a', 'branch_b'] },
    },
  },
  additionalProperties: false,
};

function pureWorkflow(overrides = (workflow) => workflow) {
  const doc = {
    name: 'pure-entity-fixture',
    version: 1,
    start: 'route',
    done: 'done',
    blocked: 'blocked',
    steps: {
      route: {
        name: 'Route',
        kind: 'worker',
        input: { role: 'backend' },
        output: { schema: 'route.schema.json' },
        next: { match: '${{ output.route }}', cases: { review: 'review', blocked: 'blocked' } },
      },
      review: {
        name: 'Review',
        kind: 'worker',
        input: { state: ['route'] },
        next: 'done',
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { state: ['route'] },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { state: ['route'] },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { state: ['branch_a', 'branch_b'] },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };
  return overrides(doc) ?? doc;
}

function validate(doc, options = {}) {
  return new Workflow(doc).validate({
    outputSchemas: new Map([['route.schema.json', routeOutputSchema]]),
    allowedRoles: { loaded: true, names: ['backend'] },
    ...options,
  });
}

function assertWorkflowFailure(doc, pattern, options) {
  assert.throws(
    () => validate(doc, options),
    (error) => {
      assert.equal(error instanceof WorkflowRuntimeError, true);
      assert.match(error.message, pattern);
      return true;
    },
  );
}

test('Workflow.validate enforces loaded role catalogs but permits unloaded catalogs for pure in-memory docs', () => {
  const doc = pureWorkflow((workflow) => {
    workflow.steps.route.input.role = 'frontend';
    return workflow;
  });

  assertWorkflowFailure(doc, /input\.role 'frontend' is not an allowed role; expected one of: backend/);
  assert.deepEqual(validate(doc, { allowedRoles: { loaded: false, names: ['backend'] } }), {
    ok: true,
    workflow: 'pure-entity-fixture',
    steps: Object.keys(doc.steps).length,
  });
});

test('Workflow.validate rejects projected state selectors that do not name declared workflow steps', () => {
  const doc = pureWorkflow((workflow) => {
    workflow.steps.review.input.state = ['missing_step'];
    return workflow;
  });

  assertWorkflowFailure(doc, /step 'review' input\.state selector 'missing_step' does not reference a declared workflow step/);
});

test('Workflow.validate keeps match/cases transitions exhaustive against closed output schema enums', () => {
  const missingSchemaCase = pureWorkflow((workflow) => {
    delete workflow.steps.route.next.cases.blocked;
    return workflow;
  });
  const unreachableCase = pureWorkflow((workflow) => {
    workflow.steps.route.next.cases.extra = 'done';
    return workflow;
  });

  assertWorkflowFailure(missingSchemaCase, /next\.cases is missing schema-declared case 'blocked'/);
  assertWorkflowFailure(unreachableCase, /next\.cases declares unreachable case 'extra' not present in the selector schema/);
});

test('Workflow.validate proves dynamic parallel targets are schema-covered and valid join branches', () => {
  const doc = pureWorkflow((workflow) => {
    workflow.steps.route.next = '${{ output.parallel_targets }}';
    return workflow;
  });
  const badParallelSchema = {
    ...routeOutputSchema,
    properties: {
      ...routeOutputSchema.properties,
      parallel_targets: {
        type: 'array',
        items: { enum: ['branch_a', 'branch_b'] },
      },
    },
  };

  assert.deepEqual(validate(doc), { ok: true, workflow: 'pure-entity-fixture', steps: Object.keys(doc.steps).length });
  assertWorkflowFailure(
    doc,
    /next expression \$\{\{ output\.parallel_targets \}\} array target schema must declare minItems >= 1/,
    { outputSchemas: new Map([['route.schema.json', badParallelSchema]]) },
  );
});

test('Workflow.validate requires worker output schemas to expose a required string outcome field', () => {
  const doc = pureWorkflow();
  const missingOutcomeSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['route'],
    properties: { route: { enum: ['review', 'blocked'] } },
    additionalProperties: false,
  };

  assertWorkflowFailure(
    doc,
    /output\.schema must require string field 'outcome' for worker outputs/,
    { outputSchemas: new Map([['route.schema.json', missingOutcomeSchema]]) },
  );
});
