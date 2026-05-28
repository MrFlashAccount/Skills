import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePathExpression, parsePathExpression } from '../lib/workflow/expressions/index.mjs';
import { WorkflowInterpreterError } from '../lib/workflow/errors.mjs';

test('expression parser accepts output and input dot paths', () => {
  assert.deepEqual(parsePathExpression('${{ output.next }}').segments, ['output', 'next']);
  assert.deepEqual(parsePathExpression('${{ input.planning_draft.selected_reviewers }}').segments, [
    'input',
    'planning_draft',
    'selected_reviewers',
  ]);
});

test('expression parser rejects unsupported v1 grammar', () => {
  const cases = [
    '${{ output.a || output.b }}',
    "${{ contains(output.roles, 'security') }}",
    '${{ output.items[0] }}',
    '${{ baton.state.secret }}',
    '${{ state.anything }}',
    'prefix-${{ output.next }}',
    '${{ output.__proto__ }}',
    '${{ output.prototype }}',
    '${{ output.constructor }}',
  ];

  for (const source of cases) {
    assert.throws(() => parsePathExpression(source), WorkflowInterpreterError, source);
  }
});

test('expression evaluator resolves only declared object paths', () => {
  assert.equal(evaluatePathExpression('${{ output.next }}', { output: { next: 'done' }, input: {} }), 'done');
  assert.deepEqual(
    evaluatePathExpression('${{ input.planning_draft.selected_reviewers }}', {
      output: {},
      input: { planning_draft: { selected_reviewers: ['backend', 'security'] } },
    }),
    ['backend', 'security'],
  );

  assert.throws(
    () => evaluatePathExpression('${{ input.hidden.selected_reviewers }}', { output: {}, input: {} }),
    /could not resolve missing path 'input.hidden'/,
  );
});
