import assert from 'node:assert/strict';
import test from 'node:test';
import { Baton, applyOutputToBatonState } from '../index.mjs';
import { WorkflowRuntimeError } from '../../../errors.mjs';

const workflow = {
  name: 'baton-fixture',
  version: 1,
  start: 'worker',
  done: 'done',
  blocked: 'blocked',
  steps: {
    worker: { name: 'Worker', kind: 'worker', next: 'done' },
    done: { name: 'Done', kind: 'done' },
    blocked: { name: 'Blocked', kind: 'blocked' },
  },
};

function baton(overrides = {}) {
  return {
    cursor: 'worker',
    status: 'running',
    state: { artifacts: [], results: [] },
    ...overrides,
  };
}

test('Baton clones input and returns defensive toJSON copies', () => {
  const source = baton({ state: { nested: { value: 1 }, artifacts: [], results: [] } });
  const entity = new Baton(source);

  source.state.nested.value = 2;
  assert.equal(entity.outputFor('nested').value, 1);

  const copy = entity.toJSON();
  copy.state.nested.value = 3;
  assert.equal(entity.outputFor('nested').value, 1);
});

test('Baton semantic validation accepts cursor/status consistency and rejects mismatches', () => {
  assert.deepEqual(new Baton(baton()).validateAgainst(workflow), { ok: true });
  assert.deepEqual(new Baton(baton({ cursor: 'done', status: 'done' })).validateAgainst(workflow), { ok: true });

  assert.throws(
    () => new Baton(baton({ cursor: 'done', status: 'running' })).validateAgainst(workflow),
    /status 'running' is inconsistent with cursor 'done'; expected 'done'/,
  );
  assert.throws(() => new Baton(baton({ cursor: 'missing' })).validateAgainst(workflow), /baton cursor not found in workflow: missing/);
});

test('Baton applies output by merging artifacts, appending results, storing attempts, and mirroring schema outputs', () => {
  const entity = new Baton(baton({ state: { artifacts: [{ id: 'a', content: 'old' }], results: [{ id: 'r1' }] } }));

  const applied = entity.withAppliedOutput(
    'worker',
    {
      outcome: 'ok',
      artifacts: [{ id: 'a', content: 'new' }, { id: 'b', content: 'added' }],
      results: [{ id: 'r2' }],
    },
    { worker: 2 },
    { mirrorToOutputs: true },
  );

  assert.deepEqual(applied.state.artifacts, [{ id: 'a', content: 'new' }, { id: 'b', content: 'added' }]);
  assert.deepEqual(applied.state.results, [{ id: 'r1' }, { id: 'r2' }]);
  assert.deepEqual(applied.state.worker.outcome, 'ok');
  assert.deepEqual(applied.state.outputs.worker.outcome, 'ok');
  assert.deepEqual(applied.state.attempts, { worker: 2 });
});

test('Baton rejects non-array aggregate output fields before mutating state', () => {
  const entity = new Baton(baton());

  assert.throws(
    () => entity.withAppliedOutput('worker', { outcome: 'ok', artifacts: { id: 'not-array' } }),
    (error) => error instanceof WorkflowRuntimeError && /\/artifacts must be array/.test(error.message),
  );
  assert.deepEqual(entity.toJSON().state, { artifacts: [], results: [] });
});

test('applyOutputToBatonState exposes only the updated state payload', () => {
  const state = applyOutputToBatonState(baton(), { outcome: 'ok', results: [{ summary: 'done' }] }, undefined, 'worker');

  assert.deepEqual(state.worker, { outcome: 'ok', results: [{ summary: 'done' }] });
  assert.deepEqual(state.results, [{ summary: 'done' }]);
});
