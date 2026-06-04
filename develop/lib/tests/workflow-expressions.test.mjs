import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePathExpression } from '../entities/Workflow/expression.mjs';
import { evaluatePathExpression } from '../entities/Step/expressions/index.mjs';
import { WorkflowRuntimeError } from '../errors.mjs';

const validParserCases = [
  ['spaced output path', '${{ output.next }}', ['output', 'next']],
  ['compact output path', '${{output.next}}', ['output', 'next']],
  ['extra inner whitespace', '${{   output.next   }}', ['output', 'next']],
  ['projected input path', '${{ input.planning_draft.selected_reviewers }}', ['input', 'planning_draft', 'selected_reviewers']],
  ['underscore and hyphen segment', '${{ output.review_step-2 }}', ['output', 'review_step-2']],
  ['digits after first character', '${{ output.next_2.step-3 }}', ['output', 'next_2', 'step-3']],
];

for (const [label, source, segments] of validParserCases) {
  test(`expression parser accepts ${label}`, () => {
    assert.deepEqual(parsePathExpression(source).segments, segments);
  });
}

const invalidParserCases = [
  ['operator expression', '${{ output.a || output.b }}'],
  ['function call', "${{ contains(output.roles, 'security') }}"],
  ['array index', '${{ output.items[0] }}'],
  ['bracket property access', '${{ output["next"] }}'],
  ['wildcard selector', '${{ output.items[*] }}'],
  ['filter selector', '${{ output.items[?(@.ready)] }}'],
  ['recursive descent', '${{ output..next }}'],
  ['unknown baton root', '${{ baton.state.secret }}'],
  ['unknown state root', '${{ state.anything }}'],
  ['unknown global root', '${{ global.anything }}'],
  ['output root only', '${{ output }}'],
  ['input root only', '${{ input }}'],
  ['leading partial template content', 'prefix ${{ output.next }}'],
  ['trailing partial template content', '${{ output.next }} suffix'],
  ['missing opening brace', '${ output.next }}'],
  ['missing closing braces', '${{ output.next }'],
  ['missing dollar', '{{ output.next }}'],
  ['digit-starting segment', '${{ output.0bad }}'],
  ['slash in segment', '${{ output.bad/key }}'],
  ['space inside path', '${{ output.bad key }}'],
  ['dangerous __proto__ key', '${{ output.__proto__ }}'],
  ['dangerous prototype key', '${{ output.prototype }}'],
  ['dangerous constructor key', '${{ output.constructor }}'],
];

for (const [label, source] of invalidParserCases) {
  test(`expression parser rejects ${label}`, () => {
    assert.throws(() => parsePathExpression(source), WorkflowRuntimeError, source);
  });
}

test('expression evaluator resolves output values', () => {
  assert.equal(evaluatePathExpression('${{ output.next }}', { output: { next: 'done' }, input: {} }), 'done');
});

test('expression evaluator resolves projected input values', () => {
  assert.deepEqual(
    evaluatePathExpression('${{ input.planning_draft.selected_reviewers }}', {
      output: {},
      input: { planning_draft: { selected_reviewers: ['backend', 'security'] } },
    }),
    ['backend', 'security'],
  );
});

const evaluatorRejectCases = [
  [
    'missing path',
    () => evaluatePathExpression('${{ input.hidden.selected_reviewers }}', { output: {}, input: {} }),
    /could not resolve missing path 'input.hidden'/,
  ],
  [
    'null intermediate',
    () => evaluatePathExpression('${{ output.next.id }}', { output: { next: null }, input: {} }),
    /could not resolve missing path 'output.next.id'/,
  ],
  [
    'undefined intermediate',
    () => evaluatePathExpression('${{ output.next.id }}', { output: { next: undefined }, input: {} }),
    /could not resolve missing path 'output.next.id'/,
  ],
  [
    'non-object intermediate output value',
    () => evaluatePathExpression('${{ output.next.id }}', { output: { next: 'review_a' }, input: {} }),
    /could not resolve missing path 'output.next.id'/,
  ],
];

for (const [label, fn, errorPattern] of evaluatorRejectCases) {
  test(`expression evaluator rejects ${label}`, () => {
    assert.throws(fn, errorPattern);
  });
}
