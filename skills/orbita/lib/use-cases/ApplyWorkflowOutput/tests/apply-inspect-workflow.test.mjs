import assert from 'node:assert/strict';
import test from 'node:test';
import { applyWorkflowOutput } from '../../ApplyWorkflowOutput.mjs';
import { inspectWorkflow } from '../../InspectWorkflow.mjs';

const workflowDoc = {
  name: 'use-case-fixture',
  version: 1,
  start: 'producer',
  done: 'done',
  blocked: 'blocked',
  steps: {
    producer: {
      name: 'Producer',
      kind: 'worker',
      output: { schema: 'producer.schema.json' },
      next: { match: '${{ output.route }}', cases: { direct: 'done', split: ['branch_a', 'branch_b'] } },
    },
    branch_a: { name: 'Branch A', kind: 'worker', output: { template: 'branch-a.md' }, next: 'join' },
    branch_b: { name: 'Branch B', kind: 'worker', output: { template: 'branch-b.md' }, next: 'join' },
    join: { name: 'Join', kind: 'worker', next: 'done' },
    done: { name: 'Done', kind: 'done' },
    blocked: { name: 'Blocked', kind: 'blocked' },
  },
};


const resources = {
  outputSchemas: new Map([
    [
      'producer.schema.json',
      {
        type: 'object',
        required: ['outcome', 'route'],
        properties: {
          outcome: { type: 'string' },
          route: { type: 'string', enum: ['direct', 'split'] },
        },
        additionalProperties: false,
      },
    ],
  ]),
};

function baton(overrides = {}) {
  return {
    cursor: 'producer',
    status: 'running',
    state: { artifacts: [], results: [] },
    ...overrides,
  };
}

test('applyWorkflowOutput applies a direct worker output through Step/Baton entities', () => {
  const response = applyWorkflowOutput({ workflowDoc, batonDoc: baton(), resources, outputValue: { outcome: 'ok', route: 'direct' } });

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.deepEqual(response.baton.state.producer, { outcome: 'ok', route: 'direct' });
  assert.deepEqual(response.steps.map((step) => step.id), ['done']);
});

test('applyWorkflowOutput advances dynamic parallel branches into cursor array', () => {
  const response = applyWorkflowOutput({ workflowDoc, batonDoc: baton(), resources, outputContent: JSON.stringify({ outcome: 'ok', route: 'split' }) });

  assert.deepEqual(response.baton.cursor, ['branch_a', 'branch_b']);
  assert.equal(response.baton.status, 'running');
  assert.deepEqual(response.baton.state.producer, { outcome: 'ok', route: 'split' });
  assert.deepEqual(response.steps.map((step) => step.id), ['branch_a', 'branch_b']);
});

test('inspectWorkflow exposes active parallel branches from cursor array', () => {
  const response = inspectWorkflow({ workflowDoc, batonDoc: baton({ cursor: ['branch_a', 'branch_b'], state: { artifacts: [], results: [], producer: { outcome: 'ok', route: 'split' } } }), resources });

  assert.deepEqual(response.steps.map((step) => step.id), ['branch_a', 'branch_b']);
});
