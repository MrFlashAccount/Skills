import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-schema-check-'));
const workerOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { enum: ['ready', 'retry', 'blocked'] },
    artifacts: { type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } },
    results: { type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } },
    blocker: { type: 'object' },
    summary: { type: 'string' },
  },
  additionalProperties: false,
};
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
writeFileSync(path.join(tempDir, 'worker-output.schema.json'), `${JSON.stringify(workerOutputSchema, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'worker-output.json'), `${JSON.stringify(workerOutputSchema, null, 2)}\n`);
mkdirSync(path.join(tempDir, 'schemas'), { recursive: true });
writeFileSync(path.join(tempDir, 'schemas', 'worker-output.json'), `${JSON.stringify(workerOutputSchema, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'ready-output.schema.json'), `${JSON.stringify({
  ...workerOutputSchema,
  properties: {
    ...workerOutputSchema.properties,
    outcome: { enum: ['ready'] },
  },
}, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'review-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { enum: ['ready', 'blocked'] },
    artifacts: { type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } },
    results: { type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } },
    blocker: { type: 'object' },
    summary: { type: 'string' },
  },
  additionalProperties: false,
}, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'approval-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['approval'],
  properties: {
    approval: { enum: ['approved', 'rejected', 'blocked'] },
    artifacts: { type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } },
    results: { type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } },
    blocker: { type: 'object' },
    choice: { enum: ['approved', 'blocked'] },
  },
  additionalProperties: false,
}, null, 2)}\n`);

function outputContract(name = 'worker') {
  const templates = {
    worker: 'output.md',
    research: 'output.md',
    review: 'output.md',
  };
  const schemas = {
    worker: 'worker-output.schema.json',
    research: 'worker-output.schema.json',
    review: 'review-output.schema.json',
    approval: 'approval-output.schema.json',
  };
  return { template: templates[name] ?? 'output.md', schema: schemas[name] ?? 'worker-output.schema.json' };
}

const schemaWorkflowDoc = {
    name: 'schema-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['worker_step'], prompt: 'Run worker.' },
        output: outputContract(),
        next: { match: '${{ output.outcome }}', cases: { ready: 'approval_step', retry: 'worker_step', blocked: 'blocked' } },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['worker_step'], prompt: 'Approve.' },
        next: { match: '${{ output.approval }}', cases: { approved: 'direct_next_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      direct_next_worker: {
        name: 'Direct next worker',
        kind: 'worker',
        input: { template: 'direct.md', state: ['worker_step'] },
        output: outputContract(),
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};

const e2eWorkflowDoc = {
    name: 'deterministic-e2e-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['worker_step'], prompt: 'Run worker.' },
        output: outputContract(),
        next: {
          match: '${{ output.outcome }}',
          cases: {
            ready: 'approval_step',
            retry: 'worker_step',
            blocked: 'blocked',
          },
        },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['worker_step'], prompt: 'Approve.' },
        next: { match: '${{ output.approval }}', cases: { approved: 'implementation_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      implementation_worker: {
        name: 'Implementation worker',
        kind: 'worker',
        input: { template: 'implementation.md', state: ['worker_step', 'approval_step'] },
        output: outputContract(),
        next: 'review_worker',
      },
      review_worker: {
        name: 'Review worker',
        kind: 'worker',
        input: { template: 'review.md', state: ['worker_step', 'approval_step'] },
        output: outputContract('review'),
        next: { match: '${{ output.outcome }}', cases: { ready: 'done', blocked: 'blocked' } },
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};

const emptyState = { artifacts: [], results: [] };

function safeName(label) {
  return label.replace(/[^a-z0-9_-]+/gi, '-');
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function baton(overrides = {}) {
  return {
    cursor: 'worker_step',
    status: 'running',
    state: structuredClone(emptyState),
    ...overrides,
  };
}

function finalOutputSchemaAttempt(stepId = 'worker_step', overrides = {}) {
  const doc = baton(overrides);
  doc.state = {
    ...(doc.state ?? {}),
    attempts: {
      ...(doc.state?.attempts ?? {}),
      [`${stepId}:output.schema`]: 2,
    },
  };
  return doc;
}

function output(overrides = {}) {
  return { outcome: 'ready', artifacts: [{ type: 'packet', summary: 'minimal packet' }], ...overrides };
}

function runNode(args, cwd = root) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

function expectCliResult(label, result, expectSuccess) {
  const succeeded = result.status === 0;
  assert.equal(
    succeeded,
    expectSuccess,
    `check '${label}' expected ${expectSuccess ? 'success' : 'failure'} but got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  if (!expectSuccess) return { stdout: result.stdout, stderr: result.stderr };

  const response = JSON.parse(result.stdout);
  assert.ok(response.baton, `check '${label}' returned no baton`);
  assert.ok(response.steps[0], `check '${label}' returned no step`);
  return response;
}


function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = schemaWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'inspect', wfPath, batonPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during inspect`);
  return response;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = schemaWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

test('runtime guard: inspect rejects reserved input.state selectors even when schema validation passes', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.input.state = ['artifacts'];

  const response = runInspect('runtime-reserved-selector-inspect', baton({ cursor: 'approval_step', status: 'running' }), false, workflowDoc);

  assert.match(response.stderr, /reserved state selector 'artifacts'.*runtime aggregate state/);
});

test('runtime guard: inspect rejects undeclared input.state selectors even when semantic validation is bypassed', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.input.state = ['missing_step'];

  const response = runInspect('runtime-missing-state-selector-inspect', baton({ cursor: 'approval_step', status: 'running' }), false, workflowDoc);

  assert.match(response.stderr, /input\.state selector 'missing_step'.*declared workflow step/);
});

test('runtime guard: apply rejects reserved workflow step ids even when semantic validation is bypassed', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.start = 'artifacts';
  workflowDoc.steps.approval_step.input.state = [];
  workflowDoc.steps.direct_next_worker.input.state = [];
  workflowDoc.steps.artifacts = workflowDoc.steps.worker_step;
  delete workflowDoc.steps.worker_step;

  const response = runApply('runtime-reserved-step-id-apply', baton({ cursor: 'artifacts' }), output(), false, workflowDoc);

  assert.match(response.stderr, /workflow step id 'artifacts'.*reserved for runtime aggregate state/);
});

function scriptedApplyLoop(label, workflowDoc, initialBaton, scriptedOutputs, { maxSteps = 12 } = {}) {
  const history = [];
  let currentBaton = structuredClone(initialBaton);
  let currentDirective = runInspect(`${label}-inspect-0`, currentBaton, true, workflowDoc).steps[0];

  for (let index = 0; index < maxSteps; index += 1) {
    history.push({ cursor: currentBaton.cursor, action: currentDirective.action });
    if (currentDirective.action === 'stop_done' || currentDirective.action === 'stop_blocked') {
      return { baton: currentBaton, steps: [currentDirective], history };
    }

    const queue = scriptedOutputs[currentBaton.cursor];
    assert.ok(Array.isArray(queue) && queue.length > 0, `no scripted output for ${currentBaton.cursor}`);
    const workerOutput = queue.shift();
    const response = runApply(`${label}-apply-${index}-${currentBaton.cursor}`, currentBaton, workerOutput, true, workflowDoc);
    currentBaton = response.baton;
    currentDirective = response.steps[0];
  }

  assert.fail(`scripted workflow did not reach a terminal action within ${maxSteps} steps`);
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('schema validation: workflow accepts output template and schema refs on worker contracts', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.output = {
    template: 'output.md',
    schema: 'schemas/worker-output.json',
  };

  const response = runInspect('output-template-schema-ref-valid', baton(), true, workflowDoc);

  assert.deepEqual(response.steps[0].step.output, {
    template: 'output.md',
    schema: 'schemas/worker-output.json',
  });
});

test('schema validation: malformed output template contract shapes are rejected', () => {
  const cases = [
    ['missing-template', {}],
    ['blank-template', { template: '' }],
    ['obsolete-format', { template: 'output.md', format: 'markdown' }],
    ['extra-output-field', { template: 'output.md', sections: ['Verdict'] }],
  ];

  for (const [label, outputShape] of cases) {
    const workflowDoc = structuredClone(schemaWorkflowDoc);
    workflowDoc.steps.worker_step.output = outputShape;

    const result = runInspect(`output-template-contract-${label}`, baton(), false, workflowDoc);

    assert.match(result.stderr, /workflow failed schema validation/);
  }
});

test('runtime: output template semantics are ignored while worker envelope is validated', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.output = {
    template: 'output.md',
    schema: 'worker-output.schema.json',
  };

  const response = runApply('output-template-semantics-ignored', baton(), {
    outcome: 'ready',
    results: [{ type: 'markdown', summary: 'No required markdown headings are validated here.' }],
  }, true, workflowDoc);

  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.state.results.at(-1).summary, 'No required markdown headings are validated here.');

  const badEnvelope = runApply('output-template-still-validates-envelope', finalOutputSchemaAttempt(), {
    outcome: 'ready',
    freeformMarkdown: '## Verdict\nready',
  }, false, workflowDoc);
  assert.match(badEnvelope.stderr, /output schema validation failed|worker output failed schema validation|workflow interpreter response failed schema validation/);
});

test('schema validation: wrapped workflow documents are rejected by the workflow schema', () => {
  const workflowDoc = { workflow: structuredClone(schemaWorkflowDoc) };

  const result = runInspect('wrapped-workflow-document', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: workflow wrapper field is rejected even on otherwise flat documents', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow = structuredClone(schemaWorkflowDoc);

  const result = runInspect('flat-with-wrapper-field', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema workflow fixture: workflow-scoped extensions are accepted and ignored by generic interpreter', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.operatorHints = {
    owner: 'specific-wrapper',
    prompts: { worker_step: 'wrapper-owned-prompt.md' },
  };

  const response = runInspect('workflow-scoped-extension', baton(), true, workflowDoc);
  assert.equal(response.steps[0].id, 'worker_step');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.equal(response.steps[0].step.input.template, 'worker.md');
  assert.equal(Object.hasOwn(response, 'operatorHints'), false);
});

test('schema validation: step-level extension fields are rejected rather than ignored', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.operatorHints = { template: 'wrapper-owned-prompt.md' };

  const result = runInspect('step-level-extension-field', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('e2e: scripted wrapper runs worker to approval to worker/review to done', () => {
  const final = scriptedApplyLoop('e2e-happy-path', e2eWorkflowDoc, baton(), {
    worker_step: [output({ outcome: 'ready', artifacts: [{ id: 'worker-packet', type: 'packet', summary: 'ready for approval' }] })],
    approval_step: [{ approval: 'approved', results: [{ type: 'approval', summary: 'approved' }] }],
    implementation_worker: [output({ outcome: 'ready', results: [{ type: 'implementation', summary: 'implemented' }] })],
    review_worker: [output({ outcome: 'ready', results: [{ type: 'review', summary: 'reviewed' }] })],
  });

  assert.equal(final.steps[0].action, 'stop_done');
  assert.equal(final.baton.cursor, 'done');
  assert.deepEqual(final.history.map((entry) => entry.cursor), [
    'worker_step',
    'approval_step',
    'implementation_worker',
    'review_worker',
    'done',
  ]);
  assert.deepEqual(final.history.map((entry) => entry.action), [
    'run_worker',
    'wait_for_approval',
    'run_worker',
    'run_worker',
    'stop_done',
  ]);
  assert.equal(final.baton.state.artifacts.find((artifact) => artifact.id === 'worker-packet').summary, 'ready for approval');
  assert.equal(final.baton.state.results.at(-1).type, 'review');
});

test('e2e: approval rejection loops back to worker before successful done', () => {
  const final = scriptedApplyLoop('e2e-rejection-rework', e2eWorkflowDoc, baton(), {
    worker_step: [
      output({ outcome: 'ready', artifacts: [{ id: 'draft', type: 'packet', summary: 'draft' }] }),
      output({ outcome: 'ready', artifacts: [{ id: 'draft', type: 'packet', summary: 'reworked' }] }),
    ],
    approval_step: [
      { approval: 'rejected', results: [{ type: 'approval', summary: 'needs rework' }] },
      { approval: 'approved', results: [{ type: 'approval', summary: 'approved after rework' }] },
    ],
    implementation_worker: [output({ outcome: 'ready' })],
    review_worker: [output({ outcome: 'ready' })],
  });

  assert.equal(final.steps[0].action, 'stop_done');
  assert.deepEqual(final.history.map((entry) => entry.cursor), [
    'worker_step',
    'approval_step',
    'worker_step',
    'approval_step',
    'implementation_worker',
    'review_worker',
    'done',
  ]);
  assert.equal(final.baton.state.artifacts.find((artifact) => artifact.id === 'draft').summary, 'reworked');
});

test('e2e: scripted blocked branch reaches stop_blocked with blocker carried on baton', () => {
  const final = scriptedApplyLoop('e2e-blocked-branch', e2eWorkflowDoc, baton(), {
    worker_step: [output({ outcome: 'blocked', blocker: { reason: 'missing dependency' } })],
  });

  assert.equal(final.steps[0].action, 'stop_blocked');
  assert.equal(final.baton.cursor, 'blocked');
  assert.deepEqual(final.baton.blocker, { reason: 'missing dependency' });
  assert.deepEqual(final.history.map((entry) => entry.cursor), ['worker_step', 'blocked']);
});

test('e2e: non-retry transition cycles stop at the deterministic scripted loop guard', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.start = 'worker_a';
  workflowDoc.steps = {
    worker_a: {
      name: 'Worker A',
      kind: 'worker',
      input: { template: 'worker-a.md' },
      output: { template: 'output.md', schema: 'ready-output.schema.json' },
      next: { match: '${{ output.outcome }}', cases: { ready: 'worker_b' } },
    },
    worker_b: {
      name: 'Worker B',
      kind: 'worker',
      input: { template: 'worker-b.md' },
      output: { template: 'output.md', schema: 'ready-output.schema.json' },
      next: { match: '${{ output.outcome }}', cases: { ready: 'worker_a' } },
    },
    done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
    blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
  };

  assert.throws(
    () => scriptedApplyLoop(
      'e2e-non-retry-cycle-guard',
      workflowDoc,
      baton({ cursor: 'worker_a' }),
      {
        worker_a: [output({ outcome: 'ready' }), output({ outcome: 'ready' })],
        worker_b: [output({ outcome: 'ready' }), output({ outcome: 'ready' })],
      },
      { maxSteps: 4 },
    ),
    /scripted workflow did not reach a terminal action within 4 steps/,
  );
});

test('inspect: worker kind resolves to run_worker and preserves input data', () => {
  const response = runInspect('inspect-worker', baton());
  assert.equal(response.steps[0].id, 'worker_step');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.equal(response.steps[0].step.kind, 'worker');
  assert.equal(response.steps[0].step.input.role, 'backend');
});

test('inspect: approval kind resolves to wait_for_approval', () => {
  const response = runInspect('inspect-approval', baton({ cursor: 'approval_step' }));
  assert.equal(response.steps[0].id, 'approval_step');
  assert.equal(response.steps[0].action, 'wait_for_approval');
});

test('inspect: done and blocked kinds resolve to stop steps', () => {
  const done = runInspect('inspect-done', baton({ cursor: 'done', status: 'done' }));
  const blocked = runInspect('inspect-blocked', baton({ cursor: 'blocked', status: 'blocked' }));
  assert.equal(done.steps[0].action, 'stop_done');
  assert.equal(blocked.steps[0].action, 'stop_blocked');
});

test('inspect: approval and terminal steps expose only canonical response fields', () => {
  const approval = runInspect('inspect-approval-step-shape', baton({ cursor: 'approval_step' }));
  const done = runInspect('inspect-done-step-shape', baton({ cursor: 'done', status: 'done' }));
  const blocked = runInspect('inspect-blocked-step-shape', baton({ cursor: 'blocked', status: 'blocked' }));

  for (const response of [approval, done, blocked]) {
    assert.deepEqual(Object.keys(response), ['baton', 'steps']);
    assert.equal(response.steps.length, 1);
    assert.deepEqual(Object.keys(response.steps[0]), ['id', 'action', 'step']);
  }

  assert.deepEqual(approval.steps[0], {
    id: 'approval_step',
    action: 'wait_for_approval',
    step: schemaWorkflowDoc.steps.approval_step,
  });
  assert.deepEqual(done.steps[0], { id: 'done', action: 'stop_done', step: schemaWorkflowDoc.steps.done });
  assert.deepEqual(blocked.steps[0], { id: 'blocked', action: 'stop_blocked', step: schemaWorkflowDoc.steps.blocked });
  assert.equal(Object.hasOwn(done.steps[0].step, 'next'), false);
  assert.equal(Object.hasOwn(blocked.steps[0].step, 'next'), false);
});

test('runtime: non-root terminal step kinds resolve terminal status and stop steps', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.archived_done = { name: 'Archived done', kind: 'done', input: { prompt: 'Archived finish.' } };
  workflowDoc.steps.deferred_blocked = { name: 'Deferred blocked', kind: 'blocked', input: { prompt: 'Deferred blockage.' } };

  const done = runInspect('inspect-non-root-done', baton({ cursor: 'archived_done', status: 'done' }), true, workflowDoc);
  const blocked = runInspect('inspect-non-root-blocked', baton({ cursor: 'deferred_blocked', status: 'blocked' }), true, workflowDoc);

  assert.equal(done.steps[0].action, 'stop_done');
  assert.equal(done.baton.status, 'done');
  assert.equal(done.steps[0].step.input.prompt, 'Archived finish.');
  assert.equal(blocked.steps[0].action, 'stop_blocked');
  assert.equal(blocked.baton.status, 'blocked');
  assert.equal(blocked.steps[0].step.input.prompt, 'Deferred blockage.');
});
test('runtime: terminal cursors reject apply instead of advancing again', () => {
  const done = runApply('apply-terminal-done', baton({ cursor: 'done', status: 'done' }), output(), false);
  const blocked = runApply('apply-terminal-blocked', baton({ cursor: 'blocked', status: 'blocked' }), output(), false);
  assert.match(done.stderr, /cursor 'done' is terminal and cannot be applied/);
  assert.match(blocked.stderr, /cursor 'blocked' is terminal and cannot be applied/);
});

test('runtime: non-root terminal cursors reject apply instead of advancing again', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.archived_done = { name: 'Archived done', kind: 'done', input: { prompt: 'Archived finish.' } };
  workflowDoc.steps.deferred_blocked = { name: 'Deferred blocked', kind: 'blocked', input: { prompt: 'Deferred blockage.' } };

  const done = runApply('apply-non-root-terminal-done', baton({ cursor: 'archived_done', status: 'done' }), output(), false, workflowDoc);
  const blocked = runApply('apply-non-root-terminal-blocked', baton({ cursor: 'deferred_blocked', status: 'blocked' }), output(), false, workflowDoc);

  assert.match(done.stderr, /cursor 'archived_done' is terminal and cannot be applied/);
  assert.match(blocked.stderr, /cursor 'deferred_blocked' is terminal and cannot be applied/);
});

test('apply: matchCases next by worker output field advances to selected target', () => {
  const response = runApply('match-cases-by-outcome', baton(), output());
  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.status, 'running');
  assert.equal(response.steps[0].action, 'wait_for_approval');
  assert.equal(response.baton.state.artifacts.at(-1).type, 'packet');
});

test('apply: transition-only output preserves existing baton state collections', () => {
  const response = runApply(
    'state-preserved-by-transition-only-output',
    baton({
      state: {
        artifacts: [{ id: 'draft', type: 'packet', summary: 'existing draft' }],
        results: [{ type: 'research', summary: 'existing result' }],
      },
    }),
    { outcome: 'ready' },
  );

  assert.equal(response.baton.cursor, 'approval_step');
  assert.deepEqual(response.baton.state.artifacts, [{ id: 'draft', type: 'packet', summary: 'existing draft' }]);
  assert.deepEqual(response.baton.state.results, [{ type: 'research', summary: 'existing result' }]);
});

test('schema validation: worker output cannot replace baton state directly', () => {
  const result = runApply(
    'worker-output-direct-state-replacement',
    finalOutputSchemaAttempt(),
    { outcome: 'ready', state: { artifacts: [{ type: 'packet', summary: 'bypassed merge' }], results: [] } },
    false,
  );

  assert.match(result.stderr, /output schema validation failed|worker output failed schema validation|workflow interpreter response failed schema validation/);
});

test('schema validation: worker output rejects unsupported fields instead of silently ignoring them', () => {
  const result = runApply(
    'worker-output-unsupported-field',
    finalOutputSchemaAttempt(),
    { outcome: 'ready', diagnostics: { summary: 'wrapper-only details' } },
    false,
  );

  assert.match(result.stderr, /output schema validation failed|worker output failed schema validation|workflow interpreter response failed schema validation/);
});

test('schema validation: worker output state collections reject malformed entries', () => {
  const artifactMissingType = runApply(
    'worker-output-artifact-missing-type',
    finalOutputSchemaAttempt(),
    { outcome: 'ready', artifacts: [{ summary: 'untyped artifact would poison baton state' }] },
    false,
  );
  assert.match(artifactMissingType.stderr, /output schema validation failed|worker output failed schema validation|workflow interpreter response failed schema validation/);

  const nonObjectResult = runApply(
    'worker-output-result-non-object',
    finalOutputSchemaAttempt(),
    { outcome: 'ready', results: ['string result would poison baton state'] },
    false,
  );
  assert.match(nonObjectResult.stderr, /output schema validation failed|worker output failed schema validation|workflow interpreter response failed schema validation/);
});

test('apply: output state replaces same-id artifacts while appending new artifacts and results', () => {
  const response = runApply(
    'state-merge-replaces-artifacts-appends-results',
    baton({
      state: {
        artifacts: [
          { id: 'draft', type: 'packet', summary: 'old draft' },
          { type: 'note', summary: 'unkeyed note' },
        ],
        results: [{ type: 'research', summary: 'existing result' }],
      },
    }),
    {
      outcome: 'ready',
      artifacts: [
        { id: 'draft', type: 'packet', summary: 'revised draft' },
        { id: 'new', type: 'packet', summary: 'new packet' },
      ],
      results: [{ type: 'worker', summary: 'new result' }],
    },
  );

  assert.equal(response.baton.cursor, 'approval_step');
  assert.deepEqual(response.baton.state.artifacts, [
    { id: 'draft', type: 'packet', summary: 'revised draft' },
    { type: 'note', summary: 'unkeyed note' },
    { id: 'new', type: 'packet', summary: 'new packet' },
  ]);
  assert.deepEqual(response.baton.state.results, [
    { type: 'research', summary: 'existing result' },
    { type: 'worker', summary: 'new result' },
  ]);
});

test('apply: output merge appends unkeyed artifacts even when artifact type matches', () => {
  const response = runApply(
    'state-merge-appends-unkeyed-artifacts',
    baton({
      state: {
        artifacts: [{ type: 'note', summary: 'existing unkeyed note' }],
        results: [],
      },
    }),
    {
      outcome: 'ready',
      artifacts: [{ type: 'note', summary: 'new unkeyed note' }],
    },
  );

  assert.equal(response.baton.cursor, 'approval_step');
  assert.deepEqual(response.baton.state.artifacts, [
    { type: 'note', summary: 'existing unkeyed note' },
    { type: 'note', summary: 'new unkeyed note' },
  ]);
});

test('apply: successful transition clears stale blocker details', () => {
  const response = runApply(
    'successful-transition-clears-stale-blocker',
    baton({ blocker: { reason: 'previous blockage' } }),
    { outcome: 'ready' },
  );

  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.status, 'running');
  assert.equal(Object.hasOwn(response.baton, 'blocker'), false);
});

test('apply: non-blocked transition does not persist incidental output blocker details', () => {
  const response = runApply(
    'non-blocked-transition-ignores-output-blocker',
    baton({ blocker: { reason: 'previous blockage' } }),
    { outcome: 'ready', blocker: { reason: 'informational note, not blocked' } },
  );

  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.status, 'running');
  assert.equal(Object.hasOwn(response.baton, 'blocker'), false);
});

test('apply: blocked transition without blocker clears stale blocker details', () => {
  const response = runApply(
    'blocked-transition-clears-stale-blocker-without-new-blocker',
    baton({ blocker: { reason: 'previous blockage' } }),
    { outcome: 'blocked' },
  );

  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.baton.status, 'blocked');
  assert.equal(response.steps[0].action, 'stop_blocked');
  assert.equal(Object.hasOwn(response.baton, 'blocker'), false);
});

test('apply: matchCases next by approval output field advances to selected target', () => {
  const response = runApply('match-cases-by-approval', baton({ cursor: 'approval_step' }), { approval: 'approved', results: [{ type: 'approval', summary: 'yes' }] });
  assert.equal(response.baton.cursor, 'direct_next_worker');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.equal(response.baton.state.results.at(-1).type, 'approval');
});

test('schema validation: approval output state collections reject malformed entries', () => {
  const artifactMissingType = runApply(
    'approval-output-artifact-missing-type',
    baton({ cursor: 'approval_step' }),
    { approval: 'approved', artifacts: [{ summary: 'untyped approval artifact would poison baton state' }] },
    false,
  );
  assert.match(artifactMissingType.stderr, /approval output failed schema validation/);

  const nonObjectResult = runApply(
    'approval-output-result-non-object',
    baton({ cursor: 'approval_step' }),
    { approval: 'approved', results: ['string approval result would poison baton state'] },
    false,
  );
  assert.match(nonObjectResult.stderr, /approval output failed schema validation/);
});

test('schema validation: approval output accepts request-specific JSON fields', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.next.match = '${{ output.choice }}';
  workflowDoc.steps.approval_step.next.cases = { option_a: 'direct_next_worker', blocked: 'blocked' };

  const response = runApply(
    'approval-output-request-specific-json',
    baton({ cursor: 'approval_step' }),
    { choice: 'option_a', answer: 'Use the safer implementation path.', confidence: 0.82 },
    true,
    workflowDoc,
  );

  assert.equal(response.baton.cursor, 'direct_next_worker');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.deepEqual(response.baton.state.approval_step, { choice: 'option_a', answer: 'Use the safer implementation path.', confidence: 0.82 });
});

test('apply: next directive exposes target step input state selectors after transition', () => {
  const response = runApply(
    'next-directive-target-state-selectors',
    baton({
      cursor: 'approval_step',
      state: {
        artifacts: [{ type: 'packet', summary: 'ready packet' }],
        results: [],
      },
    }),
    { approval: 'approved', results: [{ type: 'approval', summary: 'approved' }] },
  );

  assert.equal(response.steps[0].id, 'direct_next_worker');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.deepEqual(response.steps[0].step.input.state, ['worker_step']);
  assert.deepEqual(response.baton.state.artifacts, [{ type: 'packet', summary: 'ready packet' }]);
  assert.deepEqual(response.baton.state.results, [{ type: 'approval', summary: 'approved' }]);
});

test('apply: approval blocked transition carries blocker and resolves blocked terminal status', () => {
  const response = runApply(
    'approval-blocked-carries-blocker',
    baton({ cursor: 'approval_step' }),
    { approval: 'blocked', blocker: { reason: 'approver needs stakeholder decision' } },
  );

  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.baton.status, 'blocked');
  assert.deepEqual(response.baton.blocker, { reason: 'approver needs stakeholder decision' });
  assert.equal(response.steps[0].action, 'stop_blocked');
});

test('apply: string next advances without consulting transition value', () => {
  const response = runApply('string-next', baton({ cursor: 'direct_next_worker' }), output({ outcome: 'ready' }));
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.steps[0].action, 'stop_done');
});

test('validation: direct string next still enforces worker output vocabulary before terminal transition', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  delete workflowDoc.steps.direct_next_worker.output.schema;
  const result = runApply('string-next-worker-using-approval', baton({ cursor: 'direct_next_worker' }), { approval: 'approved' }, false, workflowDoc);

  assert.match(result.stderr, /worker cursor 'direct_next_worker' must use outcome, not approval/);
});

test('apply: direct string next still merges output state before resolving terminal directive', () => {
  const response = runApply(
    'string-next-state-merge-before-terminal',
    baton({
      cursor: 'direct_next_worker',
      state: {
        artifacts: [{ id: 'draft', type: 'packet', summary: 'before direct next' }],
        results: [{ type: 'implementation', summary: 'existing result' }],
      },
    }),
    {
      outcome: 'ready',
      artifacts: [{ id: 'draft', type: 'packet', summary: 'merged before done' }],
      results: [{ type: 'review', summary: 'terminal evidence' }],
    },
  );

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.steps[0].action, 'stop_done');
  assert.deepEqual(response.baton.state.artifacts, [{ id: 'draft', type: 'packet', summary: 'merged before done' }]);
  assert.deepEqual(response.baton.state.results, [
    { type: 'implementation', summary: 'existing result' },
    { type: 'review', summary: 'terminal evidence' },
  ]);
});

test('static validation: dangling direct string next targets fail before execution', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.direct_next_worker.next = 'missing_done';
  const result = runInspect('dangling-direct-next-target', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow step 'direct_next_worker' transition 'next' target not found: missing_done/);
});










test('static validation: dangling match/cases transition targets fail even when unselected', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.next.cases.blocked = 'missing_blocked_branch';
  const result = runApply('dangling-unselected-cases-target', baton(), output({ outcome: 'ready' }), false, workflowDoc);
  assert.match(result.stderr, /workflow step 'worker_step' transition 'next\.cases\.blocked' target not found: missing_blocked_branch/);
});



test('schema validation: unsupported obsolete vocabulary is rejected by the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.kind = 'subagent';
  workflowDoc.steps.worker_step.outcomes = { ready: 'approval_step' };
  const result = runInspect('obsolete-vocabulary', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: unsupported step kind is rejected without relying on other shape errors', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.kind = 'subagent';

  const result = runInspect('unsupported-step-kind', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: nonterminal workflow steps require next in the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  delete workflowDoc.steps.worker_step.next;
  const result = runInspect('missing-next', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: worker steps require declared output template contract', () => {
  const missingOutput = structuredClone(schemaWorkflowDoc);
  delete missingOutput.steps.worker_step.output;
  assert.match(runInspect('worker-step-missing-output', baton(), false, missingOutput).stderr, /workflow failed schema validation/);
});

test('schema validation: worker output contract allows template plus optional schema only', () => {

  const withOutputTemplate = structuredClone(schemaWorkflowDoc);
  withOutputTemplate.steps.worker_step.output.template = 'output.md';
  const response = runInspect('worker-step-output-template', baton(), true, withOutputTemplate);
  assert.equal(response.steps[0].step.output.template, 'output.md');

  const emptyTemplateName = structuredClone(schemaWorkflowDoc);
  emptyTemplateName.steps.worker_step.output.template = '';
  assert.match(runInspect('worker-step-empty-output-template', baton(), false, emptyTemplateName).stderr, /workflow failed schema validation/);

  const withOutputSchema = structuredClone(schemaWorkflowDoc);
  withOutputSchema.steps.worker_step.output.schema = 'schemas/worker-output.json';
  const schemaResponse = runInspect('worker-step-output-schema', baton(), true, withOutputSchema);
  assert.equal(schemaResponse.steps[0].step.output.schema, 'schemas/worker-output.json');

  const obsoleteFormat = structuredClone(schemaWorkflowDoc);
  obsoleteFormat.steps.worker_step.output.format = 'markdown';
  assert.match(runInspect('worker-step-obsolete-output-format', baton(), false, obsoleteFormat).stderr, /workflow failed schema validation/);

  const wrapperOwnedDetails = structuredClone(schemaWorkflowDoc);
  wrapperOwnedDetails.steps.worker_step.output.prompt = 'wrapper-owned-output-prompt.md';
  assert.match(runInspect('worker-step-output-wrapper-details', baton(), false, wrapperOwnedDetails).stderr, /workflow failed schema validation/);
});


test('schema validation: match/cases transitions require selector and non-empty cases', () => {
  const missingSelector = structuredClone(schemaWorkflowDoc);
  delete missingSelector.steps.worker_step.next.match;
  assert.match(runInspect('transition-cases-missing-selector', baton(), false, missingSelector).stderr, /workflow failed schema validation/);

  const emptyMap = structuredClone(schemaWorkflowDoc);
  emptyMap.steps.worker_step.next.cases = {};
  assert.match(runInspect('transition-cases-empty-cases', baton(), false, emptyMap).stderr, /workflow failed schema validation/);
});

test('schema validation: match/cases transition cases must be present object', () => {
  const missingMap = structuredClone(schemaWorkflowDoc);
  delete missingMap.steps.worker_step.next.cases;
  assert.match(runInspect('transition-cases-missing-cases', baton(), false, missingMap).stderr, /workflow failed schema validation/);

  const arrayMap = structuredClone(schemaWorkflowDoc);
  arrayMap.steps.worker_step.next.cases = ['approval_step'];
  assert.match(runInspect('transition-cases-array-cases', baton(), false, arrayMap).stderr, /workflow failed schema validation/);
});


test('schema validation: match/cases transition objects reject unsupported control fields', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.next.default = 'blocked';

  const result = runInspect('transition-cases-unsupported-default', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: match/cases transition selector must be non-empty', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.next.match = '';

  const result = runInspect('transition-cases-empty-selector', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: match/cases transition selector rejects non-string values', () => {
  const numericSelector = structuredClone(schemaWorkflowDoc);
  numericSelector.steps.worker_step.next.match = 0;
  assert.match(runInspect('transition-cases-numeric-selector', baton(), false, numericSelector).stderr, /workflow failed schema validation/);

  const booleanSelector = structuredClone(schemaWorkflowDoc);
  booleanSelector.steps.worker_step.next.match = false;
  assert.match(runInspect('transition-cases-boolean-selector', baton(), false, booleanSelector).stderr, /workflow failed schema validation/);
});

test('schema validation: transition target strings must be non-empty', () => {
  const emptyDirectTarget = structuredClone(schemaWorkflowDoc);
  emptyDirectTarget.steps.direct_next_worker.next = '';
  assert.match(runInspect('empty-direct-transition-target', baton({ cursor: 'direct_next_worker' }), false, emptyDirectTarget).stderr, /workflow failed schema validation/);

  const emptyMappedTarget = structuredClone(schemaWorkflowDoc);
  emptyMappedTarget.steps.worker_step.next.cases.ready = '';
  assert.match(runInspect('empty-matchCases-transition-target', baton(), false, emptyMappedTarget).stderr, /workflow failed schema validation/);
});

test('schema validation: transition target values reject non-string non-policy shapes', () => {
  const numericDirectTarget = structuredClone(schemaWorkflowDoc);
  numericDirectTarget.steps.direct_next_worker.next = 1;
  assert.match(runInspect('numeric-direct-transition-target', baton({ cursor: 'direct_next_worker' }), false, numericDirectTarget).stderr, /workflow failed schema validation/);

  const nestedMappedTarget = structuredClone(schemaWorkflowDoc);
  nestedMappedTarget.steps.worker_step.next.cases.ready = { target: { id: 'approval_step' }, maxAttempts: 2, onLimit: 'blocked' };
  assert.match(runInspect('nested-matchCases-transition-target', baton(), false, nestedMappedTarget).stderr, /workflow failed schema validation/);
});

test('schema validation: workflow terminal and start target strings must be non-empty', () => {
  const emptyStart = structuredClone(schemaWorkflowDoc);
  emptyStart.start = '';
  assert.match(runInspect('empty-workflow-start-target', baton(), false, emptyStart).stderr, /workflow failed schema validation/);

  const emptyDone = structuredClone(schemaWorkflowDoc);
  emptyDone.done = '';
  assert.match(runInspect('empty-workflow-done-target', baton(), false, emptyDone).stderr, /workflow failed schema validation/);

  const emptyBlocked = structuredClone(schemaWorkflowDoc);
  emptyBlocked.blocked = '';
  assert.match(runInspect('empty-workflow-blocked-target', baton(), false, emptyBlocked).stderr, /workflow failed schema validation/);
});

test('schema validation: terminal steps reject outgoing transitions', () => {
  const doneWithNext = structuredClone(schemaWorkflowDoc);
  doneWithNext.steps.done.next = 'worker_step';
  assert.match(runInspect('terminal-done-with-next', baton({ cursor: 'done', status: 'done' }), false, doneWithNext).stderr, /workflow failed schema validation/);

  const blockedWithNext = structuredClone(schemaWorkflowDoc);
  blockedWithNext.steps.blocked.next = 'worker_step';
  assert.match(
    runInspect('terminal-blocked-with-next', baton({ cursor: 'blocked', status: 'blocked' }), false, blockedWithNext).stderr,
    /workflow failed schema validation/,
  );
});

test('schema validation: step input rejects wrapper-owned nested fields', () => {
  const workerInputExtension = structuredClone(schemaWorkflowDoc);
  workerInputExtension.steps.worker_step.input.operatorHints = { prompt: 'wrapper-owned-worker-prompt.md' };
  assert.match(runInspect('worker-input-wrapper-field', baton(), false, workerInputExtension).stderr, /workflow failed schema validation/);

  const terminalInputExtension = structuredClone(schemaWorkflowDoc);
  terminalInputExtension.steps.done.input.operatorHints = { prompt: 'wrapper-owned-done-prompt.md' };
  assert.match(runInspect('terminal-input-wrapper-field', baton({ cursor: 'done', status: 'done' }), false, terminalInputExtension).stderr, /workflow failed schema validation/);
});

test('schema validation: input state selectors must be unique non-empty strings', () => {
  const duplicateSelector = structuredClone(schemaWorkflowDoc);
  duplicateSelector.steps.worker_step.input.state = ['worker_step', 'worker_step'];
  assert.match(runInspect('duplicate-worker-state-selector', baton(), false, duplicateSelector).stderr, /workflow failed schema validation/);

  const emptyApprovalSelector = structuredClone(schemaWorkflowDoc);
  emptyApprovalSelector.steps.approval_step.input.state = [''];
  assert.match(runInspect('empty-approval-state-selector', baton({ cursor: 'approval_step' }), false, emptyApprovalSelector).stderr, /workflow failed schema validation/);
});

test('schema validation: approval input rejects worker-only role field', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.input.role = 'backend';

  const result = runInspect('approval-input-worker-role', baton({ cursor: 'approval_step' }), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: approval steps accept optional output schema declaration', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.output = { schema: 'approval-output.schema.json' };

  const response = runInspect('approval-step-output-schema', baton({ cursor: 'approval_step' }), true, workflowDoc);

  assert.equal(response.steps[0].action, 'wait_for_approval');
  assert.equal(response.steps[0].step.output.schema, 'approval-output.schema.json');
});

test('runtime validation: baton status must match cursor semantics', () => {
  const runningCursorMarkedDone = runInspect('running-cursor-marked-done', baton({ status: 'done' }), false);
  assert.match(runningCursorMarkedDone.stderr, /baton status 'done' is inconsistent with cursor 'worker_step'; expected 'running'/);

  const doneCursorMarkedRunning = runInspect('done-cursor-marked-running', baton({ cursor: 'done', status: 'running' }), false);
  assert.match(doneCursorMarkedRunning.stderr, /baton status 'running' is inconsistent with cursor 'done'; expected 'done'/);

  const blockedCursorMarkedRunning = runInspect('blocked-cursor-marked-running', baton({ cursor: 'blocked', status: 'running' }), false);
  assert.match(blockedCursorMarkedRunning.stderr, /baton status 'running' is inconsistent with cursor 'blocked'; expected 'blocked'/);
});

test('runtime validation: workflow root targets resolve to expected terminal step kinds', () => {
  const missingStart = structuredClone(schemaWorkflowDoc);
  missingStart.start = 'missing_start';
  assert.match(runInspect('missing-workflow-start-target', baton(), false, missingStart).stderr, /workflow start target not found: missing_start/);

  const missingDone = structuredClone(schemaWorkflowDoc);
  missingDone.done = 'missing_done';
  assert.match(runInspect('missing-workflow-done-target', baton(), false, missingDone).stderr, /workflow done target not found: missing_done/);

  const missingBlocked = structuredClone(schemaWorkflowDoc);
  missingBlocked.blocked = 'missing_blocked';
  assert.match(runInspect('missing-workflow-blocked-target', baton(), false, missingBlocked).stderr, /workflow blocked target not found: missing_blocked/);

  const donePointsToWorker = structuredClone(schemaWorkflowDoc);
  donePointsToWorker.done = 'worker_step';
  assert.match(runInspect('workflow-done-target-is-worker', baton(), false, donePointsToWorker).stderr, /workflow done target 'worker_step' must be a done step/);

  const blockedPointsToWorker = structuredClone(schemaWorkflowDoc);
  blockedPointsToWorker.blocked = 'worker_step';
  assert.match(
    runInspect('workflow-blocked-target-is-worker', baton(), false, blockedPointsToWorker).stderr,
    /workflow blocked target 'worker_step' must be a blocked step/,
  );
});



test('schema validation: baton rejects wrapper-owned runtime metadata fields', () => {
  const rootRunMetadata = baton({ run: { id: 'wrapper-run-1' } });
  assert.match(runInspect('baton-root-run-metadata', rootRunMetadata, false).stderr, /baton failed schema validation/);

  const stateRunMetadata = baton({ state: { artifacts: [], results: [], run: { id: 'wrapper-run-1' } } });
  assert.match(runInspect('baton-state-run-metadata', stateRunMetadata, false).stderr, /baton failed schema validation/);
});

test('schema validation: baton rejects wrapper-owned execution trace fields', () => {
  const persistedDirective = baton({ directive: { action: 'run_worker' } });
  assert.match(runInspect('baton-root-directive-trace', persistedDirective, false).stderr, /baton failed schema validation/);

  const persistedHistory = baton({ state: { artifacts: [], results: [], history: [{ cursor: 'worker_step', action: 'run_worker' }] } });
  assert.match(runInspect('baton-state-history-trace', persistedHistory, false).stderr, /baton failed schema validation/);
});

test('validation: worker and approval transition vocabularies stay distinct', () => {
  const workerUsingApproval = runApply('worker-using-approval', finalOutputSchemaAttempt(), { approval: 'approved' }, false);
  const approvalUsingOutcome = runApply('approval-using-outcome', baton({ cursor: 'approval_step' }), { outcome: 'approved' }, false);
  assert.match(workerUsingApproval.stderr, /output schema validation failed|worker cursor 'worker_step' must use outcome/);
  assert.match(approvalUsingOutcome.stderr, /approval cursor 'approval_step' must use host\/user output fields, not outcome/);
});

test('validation: ambiguous outputs with both outcome and approval are rejected for typed steps', () => {
  const workerAmbiguous = runApply('worker-ambiguous-output', finalOutputSchemaAttempt(), { outcome: 'ready', approval: 'approved' }, false);
  const approvalAmbiguous = runApply(
    'approval-ambiguous-output',
    baton({ cursor: 'approval_step' }),
    { approval: 'approved', outcome: 'ready' },
    false,
  );

  assert.match(workerAmbiguous.stderr, /output schema validation failed|worker cursor 'worker_step' must use outcome, not approval/);
  assert.match(approvalAmbiguous.stderr, /approval cursor 'approval_step' must use host\/user output fields, not outcome/);
});

test('validation: empty match/cases value is treated as a literal missing case', () => {
  const result = runApply('empty-match-case-value', finalOutputSchemaAttempt(), output({ outcome: '' }), false);
  assert.match(result.stderr, /output schema validation failed|next\.match case '' is not defined in next\.cases/);
});

test('schema validation: nested match/cases transitions are rejected explicitly', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.next.cases.ready = {
    match: '${{ output.security_needed }}',
    cases: { yes: 'approval_step', no: 'direct_next_worker' },
  };

  const result = runApply('nested-match-cases-transition', baton(), output({ outcome: 'ready', security_needed: 'yes' }), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation: nested match\/cases transitions are not supported/);
});

test('validation: match/cases transition selector missing from output is rejected clearly', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.next.match = '${{ output.decision }}';
  workflowDoc.steps.worker_step.next.cases = { approve: 'approval_step' };

  const result = runApply('missing-transition-selector-field', baton(), output({ outcome: 'ready' }), false, workflowDoc);

  assert.match(result.stderr, /has no schema-covered path \(path not found\)/);
});

test('validation: approval match/cases transition selector mismatch is rejected clearly', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.next.match = '${{ output.decision }}';
  workflowDoc.steps.approval_step.next.cases = { approve: 'direct_next_worker' };

  const result = runApply('approval-missing-transition-selector-field', baton({ cursor: 'approval_step' }), { approval: 'approved' }, false, workflowDoc);

  assert.match(result.stderr, /could not resolve missing path 'output.decision'/);
});

test('apply: match/cases transition value string zero is accepted as a real case key', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.output.schema = 'zero-output.schema.json';
  writeFileSync(path.join(tempDir, 'zero-output.schema.json'), `${JSON.stringify({ ...workerOutputSchema, properties: { ...workerOutputSchema.properties, outcome: { enum: ['ready', 'retry', 'blocked', '0'] } } }, null, 2)}\n`);
  workflowDoc.steps.worker_step.next.cases['0'] = 'approval_step';

  const response = runApply('zero-string-match-case-value', baton(), output({ outcome: '0' }), true, workflowDoc);
  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.steps[0].action, 'wait_for_approval');
});

test('validation: match/cases transition values are matched literally without whitespace trimming', () => {
  const result = runApply('whitespace-padded-match-case-value', finalOutputSchemaAttempt(), output({ outcome: ' ready ' }), false);
  assert.match(result.stderr, /output schema validation failed|next\.match case ' ready ' is not defined in next\.cases/);
});

test('validation: unknown match case and unknown cursor are rejected', () => {
  assert.match(runApply('unknown-match-case-value', finalOutputSchemaAttempt(), output({ outcome: 'missing' }), false).stderr, /output schema validation failed|next\.match case 'missing' is not defined in next\.cases/);
  assert.match(runInspect('unknown-cursor', baton({ cursor: 'missing_step' }), false).stderr, /baton cursor not found/);
});

test('validation: unknown approval match case is rejected', () => {
  const result = runApply('unknown-approval-match-case-value', baton({ cursor: 'approval_step' }), { approval: 'deferred' }, false);
  assert.match(result.stderr, /next\.match case 'deferred' is not defined in next\.cases/);
});

test('cli: removed directive alias is rejected', () => {
  const prefix = 'removed-alias';
  const batonPath = writeJson(`${prefix}-baton.json`, baton());
  const wfPath = writeJson(`${prefix}-workflow.json`, schemaWorkflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'directive', wfPath, batonPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow-interpreter failed schema validation|usage:/);
  assert.equal(readFileSync(batonPath, 'utf8'), before, 'removed alias mutated baton file');
});

test('cli: positional paths may begin with dash', () => {
  writeFileSync(path.join(tempDir, '--workflow.json'), `${JSON.stringify(schemaWorkflowDoc, null, 2)}\n`);
  writeFileSync(path.join(tempDir, '--baton.json'), `${JSON.stringify(baton(), null, 2)}\n`);

  const result = runNode(
    [path.join(root, 'develop/lib/entrypoints/cli/workflow-interpreter.mjs'), 'inspect', '--workflow.json', '--baton.json'],
    tempDir,
  );
  const response = expectCliResult('inspect-dash-prefixed-paths', result, true);
  assert.equal(response.steps[0].id, 'worker_step');
});

test('cli: three-position apply without explicit mode is rejected', () => {
  const prefix = 'three-position-apply-without-mode';
  const wfPath = writeJson(`${prefix}-workflow.json`, schemaWorkflowDoc);
  const batonPath = writeJson(`${prefix}-baton.json`, baton());
  const outputPath = writeJson(`${prefix}-output.json`, output());
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', wfPath, batonPath, outputPath]);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /workflow-interpreter: usage: node develop\/lib\/entrypoints\/cli\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json> \| render \[--diagnostics\] <workflow\.json> <baton\.json> \| apply <workflow\.json> <baton\.json> <worker-output\.json>/,
  );
  assert.equal(readFileSync(batonPath, 'utf8'), before, 'rejected apply mutated baton file');
});

test('cli: schema validation rejects wrong arity with mode-specific usage', () => {
  const inspect = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'inspect', 'workflow.json']);
  const apply = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'apply', 'workflow.json', 'baton.json']);
  const missingMode = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'workflow.json', 'baton.json']);

  assert.equal(inspect.status, 1);
  assert.match(inspect.stderr, /workflow-interpreter: usage: node develop\/lib\/entrypoints\/cli\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json>/);

  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /workflow-interpreter: usage: node develop\/lib\/entrypoints\/cli\/workflow-interpreter\.mjs apply <workflow\.json> <baton\.json> <worker-output\.json>/);

  assert.equal(missingMode.status, 1);
  assert.match(missingMode.stderr, /workflow-interpreter: usage: node develop\/lib\/entrypoints\/cli\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json> \| render \[--diagnostics\] <workflow\.json> <baton\.json> \| apply <workflow\.json> <baton\.json> <worker-output\.json>/);
});

test('cli: unknown explicit mode with apply arity is rejected by argument schema', () => {
  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'bogus', 'workflow.json', 'baton.json', 'output.json']);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /workflow-interpreter: usage: node develop\/lib\/entrypoints\/cli\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json> \| render \[--diagnostics\] <workflow\.json> <baton\.json> \| apply <workflow\.json> <baton\.json> <worker-output\.json>/,
  );
});

test('inspect/apply response shape remains unchanged without compiledPrompt', () => {
  const inspectResponse = runInspect('inspect-no-render-prompt', baton(), true);
  assert.equal(Object.hasOwn(inspectResponse, 'compiledPrompt'), false);

  const applyResponse = runApply('apply-no-render-prompt', baton(), output(), true);
  assert.equal(Object.hasOwn(applyResponse, 'compiledPrompt'), false);
});
