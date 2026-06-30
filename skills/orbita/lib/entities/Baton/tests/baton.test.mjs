import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowRuntimeError } from '../../../errors.mjs';
import { applyOutputToBatonState } from '../../../runtime/baton-state.mjs';
import { Baton } from '../index.mjs';
import { assertBatonSchema } from '../schema/baton-schema.mjs';

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

test('Baton applies output by merging artifacts, appending results, storing attempts, and storing step output', () => {
  const entity = new Baton(baton({ state: { artifacts: [{ producerStepId: 'worker', artifact: { id: 'a', content_type: 'text/plain', path: '/runs/worker/artifacts/a.txt', summary: 'old' } }], results: [{ id: 'r1' }] } }));

  const applied = entity.withAppliedOutput(
    'worker',
    {
      outcome: 'ok',
      artifacts: [
        { id: 'a', content_type: 'text/plain', path: '/runs/worker/artifacts/a.txt', summary: 'new' },
        { id: 'b', content_type: 'text/plain', path: '/runs/worker/artifacts/b.txt', summary: 'added' },
      ],
      results: [{ id: 'r2' }],
    },
    { worker: 2 },
  );

  assert.deepEqual(applied.state.artifacts, [
    { producerStepId: 'worker', artifact: { id: 'a', content_type: 'text/plain', path: '/runs/worker/artifacts/a.txt', summary: 'new' } },
    { producerStepId: 'worker', artifact: { id: 'b', content_type: 'text/plain', path: '/runs/worker/artifacts/b.txt', summary: 'added' } },
  ]);
  assert.deepEqual(applied.state.results, [{ id: 'r1' }, { id: 'r2' }]);
  assert.deepEqual(applied.state.worker.outcome, 'ok');
  assert.deepEqual(applied.state.attempts, { worker: 2 });
});


test('Baton aggregate artifact merge keys by producer step id and artifact id', () => {
  const entity = new Baton(baton({
    state: {
      artifacts: [{ producerStepId: 'producer_a', artifact: { id: 'packet', content_type: 'text/plain', path: '/runs/producer_a/artifacts/packet.txt', summary: 'from a' } }],
      results: [],
    },
  }));

  const fromB = entity.withAppliedOutput('producer_b', {
    outcome: 'ok',
    artifacts: [{ id: 'packet', content_type: 'text/plain', path: '/runs/producer_b/artifacts/packet.txt', summary: 'from b' }],
  });

  assert.deepEqual(fromB.state.artifacts, [
    { producerStepId: 'producer_a', artifact: { id: 'packet', content_type: 'text/plain', path: '/runs/producer_a/artifacts/packet.txt', summary: 'from a' } },
    { producerStepId: 'producer_b', artifact: { id: 'packet', content_type: 'text/plain', path: '/runs/producer_b/artifacts/packet.txt', summary: 'from b' } },
  ]);
});

test('Baton rejects duplicate artifact ids in one worker output for the same producer step', () => {
  const entity = new Baton(baton());

  assert.throws(
    () => entity.withAppliedOutput('worker', {
      outcome: 'ok',
      artifacts: [
        { id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt', summary: 'first' },
        { id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet-alt.txt', summary: 'second' },
      ],
    }),
    /duplicate artifact identity \{producerStepId: 'worker', artifact\.id: 'packet'\}/,
  );
});

test('Baton rejects duplicate persisted aggregate artifact identities', () => {
  assert.throws(
    () => new Baton(baton({
      state: {
        artifacts: [
          { producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt', summary: 'first' } },
          { producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet-alt.txt', summary: 'second' } },
        ],
        results: [],
      },
    })).validateAgainst(workflow),
    /duplicate state\.artifacts identity \{producerStepId: 'worker', artifact\.id: 'packet'\}/,
  );
});

test('Baton preserves allowed same-id replacement across separate apply iterations', () => {
  const entity = new Baton(baton());
  const first = entity.withAppliedOutput('worker', {
    outcome: 'ok',
    artifacts: [{ id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt', summary: 'v1' }],
  });
  const second = new Baton(first).withAppliedOutput('worker', {
    outcome: 'ok',
    artifacts: [{ id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt', summary: 'v2' }],
  });

  assert.deepEqual(second.state.artifacts, [
    { producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt', summary: 'v2' } },
  ]);
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


test('Baton schema and entity validation reject flat aggregate artifacts', () => {
  const flatArtifactBaton = baton({
    state: {
      artifacts: [{ id: 'flat', content_type: 'text/plain', path: '/runs/worker/artifacts/flat.txt' }],
      results: [],
    },
  });

  assert.throws(() => assertBatonSchema(flatArtifactBaton), /baton/);
  assert.throws(
    () => new Baton(flatArtifactBaton).validateAgainst(workflow),
    /state\.artifacts\/0 must be aggregate artifact/,
  );
});

test('Baton rejects legacy aggregate artifacts instead of normalizing or stripping fields', () => {
  const entity = new Baton(baton({
    state: {
      artifacts: [
        {
          id: 'packet',
          content_type: 'text/plain',
          path: '/runs/worker/artifacts/packet.txt',
          summary: 'legacy',
          producer_step_id: 'worker',
        },
      ],
      results: [],
    },
  }));

  assert.throws(
    () => entity.withAppliedOutput('worker', {
      outcome: 'ok',
      artifacts: [{ id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt', summary: 'replacement' }],
    }),
    /state\/artifacts\/0 must be aggregate artifact/,
  );
});

test('Baton rejects legacy artifact contract fields', () => {
  for (const field of ['type', 'kind', 'ref', 'producer_step_id', 'version', 'replaces', 'aliases']) {
    assert.throws(
      () => new Baton(baton({
        state: { artifacts: [{ producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain', [field]: 'legacy' } }], results: [] },
      })).validateAgainst(workflow),
      new RegExp(`state\.artifacts/0/artifact/${field} is not allowed`),
    );
  }
});

test('Baton semantic validation rejects aggregate artifact payloads outside the central artifact contract', () => {
  assert.throws(
    () => new Baton(baton({
      state: { artifacts: [{ producerStepId: 'worker', artifact: { content_type: 'text/plain' } }], results: [] },
    })).validateAgainst(workflow),
    /state\.artifacts\/0\/artifact\/id must be non-empty string/,
  );

  assert.throws(
    () => new Baton(baton({
      state: { artifacts: [{ producerStepId: 'worker', artifact: { id: 'packet' } }], results: [] },
    })).validateAgainst(workflow),
    /state\.artifacts\/0\/artifact\/content_type must be non-empty string/,
  );

  assert.throws(
    () => new Baton(baton({
      state: { artifacts: [{ producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain', foo: 'legacy leak' } }], results: [] },
    })).validateAgainst(workflow),
    /state\.artifacts\/0\/artifact\/foo is not allowed/,
  );

  assert.throws(
    () => new Baton(baton({
      state: { artifacts: [{ producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain' } }], results: [] },
    })).validateAgainst(workflow),
    /state\.artifacts\/0\/artifact\/path must be non-empty string/,
  );

  assert.throws(
    () => new Baton(baton({
      state: { artifacts: [{ producerStepId: 'worker', artifact: { id: 'packet', content_type: 'text/plain', path: 'worker/artifacts/packet.txt' } }], results: [] },
    })).validateAgainst(workflow),
    /state\.artifacts\/0\/artifact\/path must be full absolute filesystem path/,
  );
});

test('Baton refuses to fabricate aggregate producer identity for artifacts without step id', () => {
  assert.throws(
    () => applyOutputToBatonState(baton(), { outcome: 'ok', artifacts: [{ id: 'packet', content_type: 'text/plain', path: '/runs/worker/artifacts/packet.txt' }] }),
    (error) => error instanceof WorkflowRuntimeError && /cannot determine producerStepId/.test(error.message) && !error.message.includes('<unknown>'),
  );
});
