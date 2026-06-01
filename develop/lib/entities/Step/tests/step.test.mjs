import assert from 'node:assert/strict';
import test from 'node:test';
import { Step, assertNoNestedMatchCasesTarget, isDynamicTransitionNext, isStaticParallelNext, normalizeTransitionNext, resolveTransition } from '../index.mjs';
import { joinForParallelTargets } from '../transition-targets.mjs';

const workflow = {
  name: 'step-fixture',
  version: 1,
  start: 'producer',
  done: 'done',
  blocked: 'blocked',
  steps: {
    producer: {
      name: 'Producer',
      kind: 'worker',
      input: { state: ['seed'] },
      output: { schema: 'producer.schema.json' },
      next: { match: '${{ output.route }}', cases: { direct: 'done', split: ['branch_a', 'branch_b'], blocked: 'blocked' } },
    },
    dynamic: { name: 'Dynamic', kind: 'worker', input: { state: ['seed'] }, next: '${{ input.seed.next }}' },
    mixed_parallel: { name: 'Mixed', kind: 'worker', next: ['branch_a', '${{ output.extra }}'] },
    approval: { name: 'Approval', kind: 'approval', next: 'done' },
    branch_a: { name: 'Branch A', kind: 'worker', next: 'join' },
    branch_b: { name: 'Branch B', kind: 'worker', next: 'join' },
    join: { name: 'Join', kind: 'worker', next: 'done' },
    done: { name: 'Done', kind: 'done' },
    blocked: { name: 'Blocked', kind: 'blocked' },
  },
};

const baton = {
  cursor: 'producer',
  status: 'running',
  state: { seed: { next: 'done' }, artifacts: [], results: [] },
};

test('transition descriptors classify static, dynamic, match, and mixed parallel next values', () => {
  assert.equal(normalizeTransitionNext('done').kind, 'static-target');
  assert.equal(normalizeTransitionNext(['branch_a', 'branch_b']).kind, 'static-parallel');
  assert.equal(normalizeTransitionNext('${{ output.next }}').kind, 'dynamic-target');
  assert.equal(normalizeTransitionNext({ match: '${{ output.route }}', cases: { ok: 'done' } }).kind, 'match-cases');
  assert.equal(normalizeTransitionNext(['branch_a', '${{ output.extra }}']).kind, 'parallel-items');

  assert.equal(isStaticParallelNext(['branch_a', 'branch_b']), true);
  assert.equal(isDynamicTransitionNext({ match: '${{ output.route }}', cases: { ok: 'done' } }), true);
});

test('resolveTransition resolves match/cases targets and validates worker output shape', () => {
  assert.deepEqual(resolveTransition({ workflow, baton, stepId: 'producer', step: workflow.steps.producer, output: { outcome: 'ok', route: 'direct' } }), {
    targetStepId: 'done',
  });
  assert.deepEqual(resolveTransition({ workflow, baton, stepId: 'producer', step: workflow.steps.producer, output: { outcome: 'ok', route: 'split' } }), {
    targetStepIds: ['branch_a', 'branch_b'],
  });

  assert.throws(
    () => resolveTransition({ workflow, baton, stepId: 'producer', step: workflow.steps.producer, output: { approval: 'yes', route: 'direct' } }),
    /worker cursor 'producer' must use outcome, not approval/,
  );
});

test('Step resolves projected input and dynamic concrete targets', () => {
  const dynamicStep = new Step({ id: 'dynamic', step: workflow.steps.dynamic });

  assert.deepEqual(dynamicStep.resolveInputs(baton), { seed: { next: 'done' } });
  assert.deepEqual(dynamicStep.resolveConcreteTargets(baton, workflow, { outcome: 'ok' }), { targetStepId: 'done' });
});

test('Step.applyOutput updates cursor/status and mirrors schema-backed outputs', () => {
  const step = new Step({ id: 'producer', step: workflow.steps.producer });
  const result = step.applyOutput({ baton, workflow, output: { outcome: 'ok', route: 'direct' }, attempts: { producer: 1 } });

  assert.equal(result.targetStepId, 'done');
  assert.equal(result.baton.cursor, 'done');
  assert.equal(result.baton.status, 'done');
  assert.deepEqual(result.baton.state.producer, { outcome: 'ok', route: 'direct' });
  assert.deepEqual(result.baton.state.outputs.producer, { outcome: 'ok', route: 'direct' });
  assert.deepEqual(result.baton.state.attempts, { producer: 1 });
});

test('Step validates prepared parallel instruction requests from a stored cursor output', () => {
  const step = new Step({ id: 'producer', step: workflow.steps.producer });
  const preparedBaton = { ...baton, state: { ...baton.state, producer: { outcome: 'ok', route: 'split' } } };

  assert.deepEqual(step.validateInstructionRequest({ workflow, baton: preparedBaton, runState: { requests: [{ stepId: 'branch_b' }] }, stepId: 'branch_b' }), {
    ok: true,
    stepId: 'branch_b',
  });
});

test('parallel target helpers reject nested match/cases and expose the shared join step', () => {
  assert.throws(
    () => assertNoNestedMatchCasesTarget({ match: '${{ output.route }}', cases: { ok: 'done' } }, 'next.cases.ok'),
    /nested match\/cases transitions are not supported at next\.cases\.ok/,
  );
  assert.equal(joinForParallelTargets(workflow, ['branch_a', 'branch_b']), 'join');
});
