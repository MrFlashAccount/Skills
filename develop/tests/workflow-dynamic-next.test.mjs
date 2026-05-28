import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-dynamic-next-'));

const dynamicOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { type: 'string' },
    next: { type: 'string' },
    selected_steps: { type: 'array', items: { type: 'string' } },
    dynamic_value: {},
    route: {
      type: 'object',
      properties: { next: { type: 'string' } },
      additionalProperties: false,
    },
    steps: {
      type: 'object',
      properties: { next: { type: 'string' } },
      additionalProperties: false,
    },
    artifacts: { type: 'array' },
    results: { type: 'array' },
    blocker: { type: 'object' },
  },
  additionalProperties: false,
};
writeFileSync(path.join(tempDir, 'dynamic-output-schema.json'), `${JSON.stringify(dynamicOutputSchema, null, 2)}\n`);

function outputContract() {
  return { template: '../../shared/templates/implementation-plan-template.md', schema: 'dynamic-output-schema.json' };
}

function workflow(next = '${{ output.next }}') {
  return {
    workflow: {
      name: 'dynamic-next-spec',
      version: 1,
      start: 'selector',
      done: 'done',
      blocked: 'blocked',
      steps: {
        selector: {
          name: 'Selector',
          kind: 'worker',
          input: { state: ['planning_draft'], prompt: 'Select next.' },
          output: outputContract(),
          next,
        },
        review_a: { name: 'Review A', kind: 'worker', input: {}, output: outputContract(), next: 'join' },
        review_b: { name: 'Review B', kind: 'worker', input: {}, output: outputContract(), next: 'join' },
        join: { name: 'Join', kind: 'worker', input: {}, output: outputContract(), next: 'done' },
        done: { name: 'Done', kind: 'done', input: { prompt: 'Done.' } },
        blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
      },
    },
  };
}

function baton(overrides = {}) {
  return {
    cursor: 'selector',
    status: 'running',
    state: {
      artifacts: [],
      results: [],
      planning_draft: { selected_reviewers: ['review_a', 'review_b'] },
    },
    ...overrides,
  };
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function runCli(label, mode, batonDoc, expectSuccess = true, workflowDoc = workflow(), workerOutput) {
  const batonPath = writeJson(`${label}-baton.json`, batonDoc);
  const workflowPath = writeJson(`${label}-workflow.json`, workflowDoc);
  const args = ['develop/scripts/workflow-interpreter.mjs', mode, workflowPath, batonPath];
  if (workerOutput !== undefined) args.push(writeJson(`${label}-output.json`, workerOutput));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.equal(
    result.status === 0,
    expectSuccess,
    `${label} expected ${expectSuccess ? 'success' : 'failure'}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return expectSuccess ? JSON.parse(result.stdout) : result;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = workflow()) {
  return runCli(label, 'apply', batonDoc, expectSuccess, workflowDoc, workerOutput);
}

function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = workflow()) {
  return runCli(label, 'inspect', batonDoc, expectSuccess, workflowDoc);
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('dynamic output string routes to the selected existing step', () => {
  const response = runApply('output-string', baton(), { outcome: 'ready', next: 'review_a' });
  assert.equal(response.baton.cursor, 'review_a');
  assert.equal(response.steps[0].id, 'review_a');
});

test('dynamic nested output path routes to the selected existing step', () => {
  const response = runApply('nested-output-string', baton(), { outcome: 'ready', route: { next: 'review_b' } }, true, workflow('${{ output.route.next }}'));
  assert.equal(response.baton.cursor, 'review_b');
  assert.equal(response.steps[0].id, 'review_b');
});

test('dynamic output path can read a top-level steps object as ordinary worker output', () => {
  const response = runApply('steps-output-string', baton(), { outcome: 'ready', steps: { next: 'review_a' } }, true, workflow('${{ output.steps.next }}'));
  assert.equal(response.baton.cursor, 'review_a');
  assert.equal(response.steps[0].id, 'review_a');
});

test('dynamic output array prepares and executes parallel steps like static array next', () => {
  const prepared = runApply('output-array-prepare', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_b'] }, true, workflow('${{ output.selected_steps }}'));
  assert.deepEqual(prepared.steps.map((step) => step.id), ['review_a', 'review_b']);
  assert.equal(prepared.baton.cursor, 'selector');
  assert.deepEqual(
    runInspect('output-array-inspect-prepared', prepared.baton, true, workflow('${{ output.selected_steps }}')).steps.map((step) => step.id),
    ['review_a', 'review_b'],
  );

  const joined = runApply(
    'output-array-join',
    prepared.baton,
    {
      steps: {
        review_a: { outcome: 'ready', next: 'join', results: [{ type: 'review', summary: 'a' }] },
        review_b: { outcome: 'ready', next: 'join', results: [{ type: 'review', summary: 'b' }] },
      },
    },
    true,
    workflow('${{ output.selected_steps }}'),
  );
  assert.equal(joined.baton.cursor, 'join');
  assert.deepEqual(joined.baton.state.results.map((result) => result.summary), ['a', 'b']);
});

test('dynamic input projected state path routes correctly', () => {
  const response = runApply('input-path', baton(), { outcome: 'ready' }, true, workflow('${{ input.planning_draft.selected_reviewers }}'));
  assert.deepEqual(response.steps.map((step) => step.id), ['review_a', 'review_b']);
});

test('dynamic input path not projected errors deterministically', () => {
  const workflowDoc = workflow('${{ input.planning_draft.selected_reviewers }}');
  workflowDoc.workflow.steps.selector.input.state = [];
  const result = runApply('input-not-projected', baton(), { outcome: 'ready' }, false, workflowDoc);
  assert.match(result.stderr, /could not resolve missing path 'input.planning_draft'/);
});

test('dynamic next rejects missing paths and invalid resolved values', () => {
  assert.match(
    runApply('missing-output-path', baton(), { outcome: 'ready' }, false, workflow('${{ output.missing_next }}')).stderr,
    /could not resolve missing path 'output.missing_next'/,
  );
  assert.match(runApply('empty-string', baton(), { outcome: 'ready', next: '' }, false).stderr, /dynamic next resolved to an empty string/);

  for (const [label, dynamic_value] of [
    ['null-value', null],
    ['number-value', 7],
    ['object-value', { target: 'review_a' }],
    ['nested-array-value', ['review_a', ['review_b']]],
  ]) {
    assert.match(
      runApply(label, baton(), { outcome: 'ready', dynamic_value }, false, workflow('${{ output.dynamic_value }}')).stderr,
      /dynamic next must resolve to a string step id or array of step ids|must resolve to non-empty string step ids/,
    );
  }
});

test('dynamic next rejects unknown target, empty arrays, and duplicate ids', () => {
  assert.match(runApply('unknown-target', baton(), { outcome: 'ready', next: 'missing' }, false).stderr, /target not found: missing/);
  assert.match(
    runApply('empty-array', baton(), { outcome: 'ready', selected_steps: [] }, false, workflow('${{ output.selected_steps }}')).stderr,
    /must resolve to a non-empty array/,
  );
  assert.match(
    runApply('duplicate-array', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_a'] }, false, workflow('${{ output.selected_steps }}')).stderr,
    /duplicate target 'review_a'/,
  );
});

test('dynamic parallel next enforces join-shape validation', () => {
  const nestedWorkflow = workflow('${{ output.selected_steps }}');
  nestedWorkflow.workflow.steps.review_a.next = ['join'];
  assert.match(
    runApply('dynamic-nested-parallel-target', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_b'] }, false, nestedWorkflow).stderr,
    /parallel branch target 'review_a' cannot start nested parallel steps/,
  );

  const matchCasesBranchWorkflow = workflow('${{ output.selected_steps }}');
  matchCasesBranchWorkflow.workflow.steps.review_a.next = { match: '${{ output.outcome }}', cases: { ready: 'join' } };
  assert.match(
    runApply('dynamic-match-cases-branch-target', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_b'] }, false, matchCasesBranchWorkflow).stderr,
    /parallel branch target 'review_a' must use a string next to an explicit join step/,
  );

  const splitJoinWorkflow = workflow('${{ output.selected_steps }}');
  splitJoinWorkflow.workflow.steps.review_b.next = 'done';
  assert.match(
    runApply('dynamic-split-join-targets', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_b'] }, false, splitJoinWorkflow).stderr,
    /parallel branch targets must share one explicit join step/,
  );
});

test('match/cases output path routes string target', () => {
  const matchWorkflow = workflow({ match: '${{ output.outcome }}', cases: { ready: 'review_b', blocked: 'blocked' } });
  const matched = runApply('match-cases-output-string', baton(), { outcome: 'ready' }, true, matchWorkflow);
  assert.equal(matched.baton.cursor, 'review_b');
});

test('match/cases input projected path routes target', () => {
  const matchWorkflow = workflow({ match: '${{ input.planning_draft.route }}', cases: { review: 'review_a', blocked: 'blocked' } });
  const matched = runApply(
    'match-cases-input-string',
    baton({ state: { artifacts: [], results: [], planning_draft: { selected_reviewers: ['review_a', 'review_b'], route: 'review' } } }),
    { outcome: 'ready' },
    true,
    matchWorkflow,
  );
  assert.equal(matched.baton.cursor, 'review_a');
});

test('match/cases target can be a string array', () => {
  const matchWorkflow = workflow({ match: '${{ output.outcome }}', cases: { ready: ['review_a', 'review_b'], blocked: 'blocked' } });
  const matched = runApply('match-cases-array-target', baton(), { outcome: 'ready' }, true, matchWorkflow);
  assert.deepEqual(matched.steps.map((step) => step.id), ['review_a', 'review_b']);
});

test('match/cases rejects missing cases and non-string match results', () => {
  const matchWorkflow = workflow({ match: '${{ output.outcome }}', cases: { ready: 'review_b' } });
  assert.match(
    runApply('match-cases-missing-case', baton(), { outcome: 'blocked' }, false, matchWorkflow).stderr,
    /next\.match case 'blocked' is not defined in next\.cases/,
  );

  const nonStringWorkflow = workflow({ match: '${{ output.dynamic_value }}', cases: { ready: 'review_b' } });
  for (const [label, dynamic_value] of [
    ['match-null', null],
    ['match-number', 7],
    ['match-boolean', true],
    ['match-object', { outcome: 'ready' }],
    ['match-array', ['ready']],
  ]) {
    assert.match(
      runApply(label, baton(), { outcome: 'ready', dynamic_value }, false, nonStringWorkflow).stderr,
      /next\.match must resolve to a string case key/,
    );
  }
});


test('match/cases array target rejects empty, duplicate, unknown, and nested arrays', () => {
  for (const [label, target, pattern] of [
    ['case-array-empty', [], /workflow failed schema validation|must resolve to a non-empty array/],
    ['case-array-duplicate', ['review_a', 'review_a'], /workflow failed schema validation|duplicate target 'review_a'/],
    ['case-array-unknown', ['review_a', 'missing'], /target not found: missing/],
    ['case-array-nested', ['review_a', ['review_b']], /workflow failed schema validation|must resolve to non-empty string step ids/],
  ]) {
    const matchWorkflow = workflow({ match: '${{ output.outcome }}', cases: { ready: target, blocked: 'blocked' } });
    assert.match(runApply(label, baton(), { outcome: 'ready' }, false, matchWorkflow).stderr, pattern);
  }
});



test('top-level next array supports static plus match/cases string target', () => {
  const workflowDoc = workflow(['review_a', { match: '${{ output.outcome }}', cases: { ready: 'review_b', blocked: 'blocked' } }]);
  const response = runApply('top-array-static-match-string', baton(), { outcome: 'ready' }, true, workflowDoc);
  assert.deepEqual(response.steps.map((step) => step.id), ['review_a', 'review_b']);
});

test('top-level next array flattens match/cases array target', () => {
  const workflowDoc = workflow(['review_a', { match: '${{ output.outcome }}', cases: { ready: ['review_b'], blocked: 'blocked' } }]);
  const response = runApply('top-array-match-array-flatten', baton(), { outcome: 'ready' }, true, workflowDoc);
  assert.deepEqual(response.steps.map((step) => step.id), ['review_a', 'review_b']);
});

test('top-level next array rejects duplicates and unknown ids after flattening', () => {
  const duplicateWorkflow = workflow(['review_a', { match: '${{ output.outcome }}', cases: { ready: ['review_a', 'review_b'] } }]);
  assert.match(runApply('top-array-flatten-duplicate', baton(), { outcome: 'ready' }, false, duplicateWorkflow).stderr, /duplicate target 'review_a'/);

  const unknownWorkflow = workflow(['review_a', { match: '${{ output.outcome }}', cases: { ready: ['review_b', 'missing'] } }]);
  assert.match(runApply('top-array-flatten-unknown', baton(), { outcome: 'ready' }, false, unknownWorkflow).stderr, /target not found: missing/);
});

test('match/cases rejects nested match/cases inside cases explicitly', () => {
  const workflowDoc = workflow({
    match: '${{ output.outcome }}',
    cases: { ready: { match: '${{ output.route.next }}', cases: { review: 'review_b' } } },
  });
  assert.match(
    runApply('nested-match-cases-case', baton(), { outcome: 'ready', route: { next: 'review' } }, false, workflowDoc).stderr,
    /workflow failed schema validation: nested match\/cases transitions are not supported at steps\.selector\.next\.cases\.ready/,
  );
});

test('top-level next array rejects nested match/cases inside cases explicitly', () => {
  const workflowDoc = workflow([
    'review_a',
    { match: '${{ output.outcome }}', cases: { ready: { match: '${{ output.route.next }}', cases: { review: 'review_b' } } } },
  ]);
  assert.match(
    runApply('top-array-nested-match-cases-case', baton(), { outcome: 'ready', route: { next: 'review' } }, false, workflowDoc).stderr,
    /workflow failed schema validation: nested match\/cases transitions are not supported at steps\.selector\.next\.1\.cases\.ready/,
  );
});

test('match/cases rejects nested match/cases inside case arrays explicitly', () => {
  const workflowDoc = workflow({
    match: '${{ output.outcome }}',
    cases: { ready: ['review_a', { match: '${{ output.route.next }}', cases: { review: 'review_b' } }] },
  });
  assert.match(
    runApply('case-array-nested-match-cases', baton(), { outcome: 'ready', route: { next: 'review' } }, false, workflowDoc).stderr,
    /workflow failed schema validation: nested match\/cases transitions are not supported at steps\.selector\.next\.cases\.ready\.1/,
  );
});

test('old next.by/map is rejected while static and direct dynamic next still work', () => {
  const literal = runApply('literal-next', baton(), { outcome: 'ready', next: 'ignored' }, true, workflow('review_a'));
  assert.equal(literal.baton.cursor, 'review_a');

  const staticParallel = runApply('static-parallel-next', baton(), { outcome: 'ready', next: 'ignored' }, true, workflow(['review_a', 'review_b']));
  assert.deepEqual(staticParallel.steps.map((step) => step.id), ['review_a', 'review_b']);

  const directDynamic = runApply('direct-dynamic-next-still-works', baton(), { outcome: 'ready', next: 'review_a' });
  assert.equal(directDynamic.baton.cursor, 'review_a');

  const result = runApply('old-by-map-rejected', baton(), { outcome: 'ready' }, false, workflow({ by: 'outcome', map: { ready: 'review_b' } }));
  assert.match(result.stderr, /workflow failed schema validation/);
});
