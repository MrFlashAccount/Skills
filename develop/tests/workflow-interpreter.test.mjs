import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-schema-check-'));
const devHarnessWorkflowPath = path.join(root, 'develop/dev-harness.workflow.json');

function outputContract(name = 'worker') {
  const templates = {
    worker: '../../shared/templates/implementation-plan-template.md',
    research: '../../shared/templates/research-packet-template.md',
  };
  return { template: templates[name] ?? '../../shared/templates/review-verdict-template.md' };
}

const schemaWorkflowDoc = {
  workflow: {
    name: 'schema-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['artifacts'], prompt: 'Run worker.' },
        output: outputContract(),
        next: { by: 'outcome', map: { ready: 'approval_step', retry: { target: 'worker_step', maxAttempts: 2, onLimit: 'blocked' }, blocked: 'blocked' } },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['artifacts'], prompt: 'Approve.' },
        next: { by: 'approval', map: { approved: 'direct_next_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      direct_next_worker: {
        name: 'Direct next worker',
        kind: 'worker',
        input: { template: 'direct.md', state: ['results'] },
        output: outputContract(),
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
  },
};

const e2eWorkflowDoc = {
  workflow: {
    name: 'deterministic-e2e-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['artifacts'], prompt: 'Run worker.' },
        output: outputContract(),
        next: {
          by: 'outcome',
          map: {
            ready: 'approval_step',
            retry: { target: 'worker_step', maxAttempts: 2, onLimit: 'blocked' },
            blocked: 'blocked',
          },
        },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['artifacts'], prompt: 'Approve.' },
        next: { by: 'approval', map: { approved: 'implementation_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      implementation_worker: {
        name: 'Implementation worker',
        kind: 'worker',
        input: { template: 'implementation.md', state: ['artifacts', 'results'] },
        output: outputContract(),
        next: 'review_worker',
      },
      review_worker: {
        name: 'Review worker',
        kind: 'worker',
        input: { template: 'review.md', state: ['artifacts', 'results'] },
        output: outputContract(),
        next: { by: 'outcome', map: { ready: 'done', blocked: 'blocked' } },
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
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
  assert.ok(response.directive, `check '${label}' returned no directive`);
  return response;
}

function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = schemaWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', wfPath, batonPath]);
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

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

function scriptedApplyLoop(label, workflowDoc, initialBaton, scriptedOutputs, { maxSteps = 12 } = {}) {
  const history = [];
  let currentBaton = structuredClone(initialBaton);
  let currentDirective = runInspect(`${label}-inspect-0`, currentBaton, true, workflowDoc).directive;

  for (let index = 0; index < maxSteps; index += 1) {
    history.push({ cursor: currentBaton.cursor, action: currentDirective.action });
    if (currentDirective.action === 'stop_done' || currentDirective.action === 'stop_blocked') {
      return { baton: currentBaton, directive: currentDirective, history };
    }

    const queue = scriptedOutputs[currentBaton.cursor];
    assert.ok(Array.isArray(queue) && queue.length > 0, `no scripted output for ${currentBaton.cursor}`);
    const workerOutput = queue.shift();
    const response = runApply(`${label}-apply-${index}-${currentBaton.cursor}`, currentBaton, workerOutput, true, workflowDoc);
    currentBaton = response.baton;
    currentDirective = response.directive;
  }

  assert.fail(`scripted workflow did not reach a terminal action within ${maxSteps} steps`);
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('schema workflow fixture: DevHarness JSON is accepted without DevHarness-specific interpreter semantics', () => {
  const batonPath = writeJson('dev-harness-baton.json', { cursor: 'research', status: 'running', state: structuredClone(emptyState) });
  const response = expectCliResult(
    'dev-harness-fixture',
    runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', devHarnessWorkflowPath, batonPath]),
    true,
  );
  assert.equal(response.directive.id, 'research');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.kind, 'worker');
  assert.deepEqual(response.directive.vertex.input.state, ['artifacts', 'results']);
  assert.deepEqual(response.directive.vertex.output, { template: '../../shared/templates/research-packet-template.md' });
});



test('schema workflow fixture: DevHarness worker outputs use skill-relative shared output templates', () => {
  const workflowDoc = JSON.parse(readFileSync(devHarnessWorkflowPath, 'utf8'));
  for (const [stepId, step] of Object.entries(workflowDoc.workflow.steps)) {
    if (step.kind !== 'worker') continue;

    assert.deepEqual(Object.keys(step.output).sort(), ['template'], `${stepId} output should only declare a template`);
    assert.match(step.output.template, /^\.\.\/\.\.\/shared\/templates\//, `${stepId} should use the skill-relative shared templates layout`);
    assert.ok(existsSync(path.resolve(root, 'skills/dev-harness', step.output.template)), `${stepId} output template should exist`);
  }
});



test('schema validation: workflow accepts output template refs on worker contracts', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.output = outputContract('research');

  const response = runInspect('output-template-ref-valid', baton(), true, workflowDoc);

  assert.deepEqual(response.directive.vertex.output, {
    template: '../../shared/templates/research-packet-template.md',
  });
});

test('schema validation: malformed output template contract shapes are rejected', () => {
  const cases = [
    ['missing-template', {}],
    ['blank-template', { template: '' }],
    ['obsolete-schema', { schema: 'schemas/worker-output.json', template: '../../shared/templates/research-packet-template.md' }],
    ['obsolete-format', { template: '../../shared/templates/research-packet-template.md', format: 'markdown' }],
    ['extra-output-field', { template: '../../shared/templates/research-packet-template.md', sections: ['Verdict'] }],
  ];

  for (const [label, outputShape] of cases) {
    const workflowDoc = structuredClone(schemaWorkflowDoc);
    workflowDoc.workflow.steps.worker_step.output = outputShape;

    const result = runInspect(`output-template-contract-${label}`, baton(), false, workflowDoc);

    assert.match(result.stderr, /workflow failed schema validation/);
  }
});

test('runtime: output template semantics are ignored while worker envelope is validated', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.output = {
    template: '../../shared/templates/research-packet-template.md',
  };

  const response = runApply('output-template-semantics-ignored', baton(), {
    outcome: 'ready',
    results: [{ type: 'markdown', summary: 'No required markdown headings are validated here.' }],
  }, true, workflowDoc);

  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.state.results.at(-1).summary, 'No required markdown headings are validated here.');

  const badEnvelope = runApply('output-template-still-validates-envelope', baton(), {
    outcome: 'ready',
    freeformMarkdown: '## Verdict\nready',
  }, false, workflowDoc);
  assert.match(badEnvelope.stderr, /worker output failed schema validation/);
});

test('schema validation: top-level wrapper fields are rejected by the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc['meta' + 'data'] = { owner: 'specific-wrapper' };

  const result = runInspect('top-level-wrapper-field', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema workflow fixture: workflow-scoped extensions are accepted and ignored by generic interpreter', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.operatorHints = {
    owner: 'specific-wrapper',
    prompts: { worker_step: 'wrapper-owned-prompt.md' },
  };

  const response = runInspect('workflow-scoped-extension', baton(), true, workflowDoc);
  assert.equal(response.directive.id, 'worker_step');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.input.template, 'worker.md');
  assert.equal(Object.hasOwn(response, 'operatorHints'), false);
});

test('schema validation: step-level extension fields are rejected rather than ignored', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.operatorHints = { template: 'wrapper-owned-prompt.md' };

  const result = runInspect('step-level-extension-field', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('e2e: scripted wrapper runs worker to approval to worker/review to done', () => {
  const final = scriptedApplyLoop('e2e-happy-path', e2eWorkflowDoc, baton(), {
    worker_step: [output({ outcome: 'ready', artifacts: [{ id: 'worker-packet', type: 'packet', summary: 'ready for approval' }] })],
    approval_step: [{ approval: 'approved', results: [{ type: 'approval', summary: 'approved' }] }],
    implementation_worker: [output({ outcome: 'implemented', results: [{ type: 'implementation', summary: 'implemented' }] })],
    review_worker: [output({ outcome: 'ready', results: [{ type: 'review', summary: 'reviewed' }] })],
  });

  assert.equal(final.directive.action, 'stop_done');
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
    implementation_worker: [output({ outcome: 'implemented' })],
    review_worker: [output({ outcome: 'ready' })],
  });

  assert.equal(final.directive.action, 'stop_done');
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

  assert.equal(final.directive.action, 'stop_blocked');
  assert.equal(final.baton.cursor, 'blocked');
  assert.deepEqual(final.baton.blocker, { reason: 'missing dependency' });
  assert.deepEqual(final.history.map((entry) => entry.cursor), ['worker_step', 'blocked']);
});

test('e2e: non-retry transition cycles stop at the deterministic scripted loop guard', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.start = 'worker_a';
  workflowDoc.workflow.steps = {
    worker_a: {
      name: 'Worker A',
      kind: 'worker',
      input: { template: 'worker-a.md' },
      output: outputContract(),
      next: { by: 'outcome', map: { go: 'worker_b' } },
    },
    worker_b: {
      name: 'Worker B',
      kind: 'worker',
      input: { template: 'worker-b.md' },
      output: outputContract(),
      next: { by: 'outcome', map: { back: 'worker_a' } },
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
        worker_a: [output({ outcome: 'go' }), output({ outcome: 'go' })],
        worker_b: [output({ outcome: 'back' }), output({ outcome: 'back' })],
      },
      { maxSteps: 4 },
    ),
    /scripted workflow did not reach a terminal action within 4 steps/,
  );
});

test('inspect: worker kind resolves to run_worker and preserves input data', () => {
  const response = runInspect('inspect-worker', baton());
  assert.equal(response.directive.id, 'worker_step');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.kind, 'worker');
  assert.equal(response.directive.vertex.input.role, 'backend');
});

test('inspect: approval kind resolves to wait_for_approval', () => {
  const response = runInspect('inspect-approval', baton({ cursor: 'approval_step' }));
  assert.equal(response.directive.id, 'approval_step');
  assert.equal(response.directive.action, 'wait_for_approval');
});

test('inspect: done and blocked kinds resolve to stop directives', () => {
  const done = runInspect('inspect-done', baton({ cursor: 'done', status: 'done' }));
  const blocked = runInspect('inspect-blocked', baton({ cursor: 'blocked', status: 'blocked' }));
  assert.equal(done.directive.action, 'stop_done');
  assert.equal(blocked.directive.action, 'stop_blocked');
});

test('inspect: approval and terminal directives expose only canonical response fields', () => {
  const approval = runInspect('inspect-approval-directive-shape', baton({ cursor: 'approval_step' }));
  const done = runInspect('inspect-done-directive-shape', baton({ cursor: 'done', status: 'done' }));
  const blocked = runInspect('inspect-blocked-directive-shape', baton({ cursor: 'blocked', status: 'blocked' }));

  for (const response of [approval, done, blocked]) {
    assert.deepEqual(Object.keys(response), ['baton', 'directive']);
    assert.deepEqual(Object.keys(response.directive), ['id', 'action', 'vertex']);
  }

  assert.deepEqual(approval.directive, {
    id: 'approval_step',
    action: 'wait_for_approval',
    vertex: schemaWorkflowDoc.workflow.steps.approval_step,
  });
  assert.deepEqual(done.directive, { id: 'done', action: 'stop_done', vertex: schemaWorkflowDoc.workflow.steps.done });
  assert.deepEqual(blocked.directive, { id: 'blocked', action: 'stop_blocked', vertex: schemaWorkflowDoc.workflow.steps.blocked });
  assert.equal(Object.hasOwn(done.directive.vertex, 'next'), false);
  assert.equal(Object.hasOwn(blocked.directive.vertex, 'next'), false);
});

test('runtime: terminal cursors reject apply instead of advancing again', () => {
  const done = runApply('apply-terminal-done', baton({ cursor: 'done', status: 'done' }), output(), false);
  const blocked = runApply('apply-terminal-blocked', baton({ cursor: 'blocked', status: 'blocked' }), output(), false);
  assert.match(done.stderr, /cursor 'done' is terminal and cannot be applied/);
  assert.match(blocked.stderr, /cursor 'blocked' is terminal and cannot be applied/);
});

test('apply: mapped next by worker output field advances to selected target', () => {
  const response = runApply('map-by-outcome', baton(), output());
  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.status, 'running');
  assert.equal(response.directive.action, 'wait_for_approval');
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
    baton(),
    { outcome: 'ready', state: { artifacts: [{ type: 'packet', summary: 'bypassed merge' }], results: [] } },
    false,
  );

  assert.match(result.stderr, /worker output failed schema validation/);
});

test('schema validation: worker output rejects unsupported fields instead of silently ignoring them', () => {
  const result = runApply(
    'worker-output-unsupported-field',
    baton(),
    { outcome: 'ready', diagnostics: { summary: 'wrapper-only details' } },
    false,
  );

  assert.match(result.stderr, /worker output failed schema validation/);
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
  assert.equal(response.directive.action, 'stop_blocked');
  assert.equal(Object.hasOwn(response.baton, 'blocker'), false);
});

test('apply: mapped next by approval output field advances to selected target', () => {
  const response = runApply('map-by-approval', baton({ cursor: 'approval_step' }), { approval: 'approved', results: [{ type: 'approval', summary: 'yes' }] });
  assert.equal(response.baton.cursor, 'direct_next_worker');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.baton.state.results.at(-1).type, 'approval');
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

  assert.equal(response.directive.id, 'direct_next_worker');
  assert.equal(response.directive.action, 'run_worker');
  assert.deepEqual(response.directive.vertex.input.state, ['results']);
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
  assert.equal(response.directive.action, 'stop_blocked');
});

test('apply: string next advances without consulting transition value', () => {
  const response = runApply('string-next', baton({ cursor: 'direct_next_worker' }), output({ outcome: 'anything' }));
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.directive.action, 'stop_done');
});

test('validation: direct string next still enforces worker output vocabulary before terminal transition', () => {
  const result = runApply('string-next-worker-using-approval', baton({ cursor: 'direct_next_worker' }), { approval: 'approved' }, false);

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
      outcome: 'anything',
      artifacts: [{ id: 'draft', type: 'packet', summary: 'merged before done' }],
      results: [{ type: 'review', summary: 'terminal evidence' }],
    },
  );

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.directive.action, 'stop_done');
  assert.deepEqual(response.baton.state.artifacts, [{ id: 'draft', type: 'packet', summary: 'merged before done' }]);
  assert.deepEqual(response.baton.state.results, [
    { type: 'implementation', summary: 'existing result' },
    { type: 'review', summary: 'terminal evidence' },
  ]);
});

test('runtime: dangling direct string next targets fail when the resolver uses them', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.direct_next_worker.next = 'missing_done';
  const result = runApply('dangling-direct-next-target', baton({ cursor: 'direct_next_worker' }), output(), false, workflowDoc);
  assert.match(result.stderr, /transition target not found in workflow: missing_done/);
});

test('apply: retry policy persists attempt counters until maxAttempts then uses onLimit', () => {
  const first = runApply('retry-first', baton(), output({ outcome: 'retry' }));
  assert.equal(first.baton.cursor, 'worker_step');
  assert.deepEqual(first.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 1 });

  const second = runApply('retry-second', first.baton, output({ outcome: 'retry' }));
  assert.equal(second.baton.cursor, 'worker_step');
  assert.deepEqual(second.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });

  const limited = runApply('retry-limit', second.baton, output({ outcome: 'retry' }));
  assert.equal(limited.baton.cursor, 'blocked');
  assert.equal(limited.baton.status, 'blocked');
  assert.deepEqual(limited.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });
});

test('apply: retry limit respects persisted attempt counters after resume', () => {
  const resumedAtLimit = baton({
    state: {
      artifacts: [],
      results: [],
      attempts: { 'worker_step:outcome:retry->worker_step': 2 },
    },
  });

  const limited = runApply('retry-limit-from-persisted-attempts', resumedAtLimit, output({ outcome: 'retry' }));

  assert.equal(limited.baton.cursor, 'blocked');
  assert.equal(limited.baton.status, 'blocked');
  assert.equal(limited.directive.action, 'stop_blocked');
  assert.deepEqual(limited.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });
});

test('apply: retry onLimit blocked transition carries the limiting output blocker', () => {
  const first = runApply('retry-limit-blocker-first', baton(), output({ outcome: 'retry' }));
  const second = runApply('retry-limit-blocker-second', first.baton, output({ outcome: 'retry' }));

  const limited = runApply(
    'retry-limit-blocker',
    second.baton,
    output({ outcome: 'retry', blocker: { reason: 'retry budget exhausted' } }),
  );

  assert.equal(limited.baton.cursor, 'blocked');
  assert.equal(limited.baton.status, 'blocked');
  assert.deepEqual(limited.baton.blocker, { reason: 'retry budget exhausted' });
  assert.equal(limited.directive.action, 'stop_blocked');
});

test('apply: retry onLimit blocked transition still merges limiting output state', () => {
  const first = runApply('retry-limit-state-first', baton(), { outcome: 'retry' });
  const second = runApply('retry-limit-state-second', first.baton, { outcome: 'retry' });

  const limited = runApply(
    'retry-limit-state',
    second.baton,
    output({
      outcome: 'retry',
      artifacts: [{ id: 'failure-packet', type: 'packet', summary: 'last failed attempt evidence' }],
      results: [{ type: 'retry-limit', summary: 'retry budget exhausted with diagnostics' }],
    }),
  );

  assert.equal(limited.baton.cursor, 'blocked');
  assert.equal(limited.baton.status, 'blocked');
  assert.equal(limited.directive.action, 'stop_blocked');
  assert.deepEqual(limited.baton.state.artifacts, [{ id: 'failure-packet', type: 'packet', summary: 'last failed attempt evidence' }]);
  assert.deepEqual(limited.baton.state.results, [{ type: 'retry-limit', summary: 'retry budget exhausted with diagnostics' }]);
  assert.deepEqual(limited.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });
});

test('apply: retry onLimit can target done and resolves terminal done status', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.retry.onLimit = 'done';

  const first = runApply('retry-limit-done-first', baton(), output({ outcome: 'retry' }), true, workflowDoc);
  const second = runApply('retry-limit-done-second', first.baton, output({ outcome: 'retry' }), true, workflowDoc);
  const limited = runApply('retry-limit-done', second.baton, output({ outcome: 'retry' }), true, workflowDoc);

  assert.equal(limited.baton.cursor, 'done');
  assert.equal(limited.baton.status, 'done');
  assert.equal(limited.directive.action, 'stop_done');
  assert.deepEqual(limited.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });
  assert.equal(Object.hasOwn(limited.baton, 'blocker'), false);
});

test('apply: retry onLimit can target nonterminal approval and resolves the next directive', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.retry.onLimit = 'approval_step';

  const first = runApply('retry-limit-approval-first', baton(), output({ outcome: 'retry' }), true, workflowDoc);
  const second = runApply('retry-limit-approval-second', first.baton, output({ outcome: 'retry' }), true, workflowDoc);
  const limited = runApply('retry-limit-approval', second.baton, output({ outcome: 'retry' }), true, workflowDoc);

  assert.equal(limited.baton.cursor, 'approval_step');
  assert.equal(limited.baton.status, 'running');
  assert.equal(limited.directive.action, 'wait_for_approval');
  assert.deepEqual(limited.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });
  assert.equal(Object.hasOwn(limited.baton, 'blocker'), false);
});

test('apply: successful non-retry transition clears retry attempt counters', () => {
  const retried = runApply('retry-reset-first', baton(), output({ outcome: 'retry' }));
  assert.equal(retried.baton.cursor, 'worker_step');
  assert.deepEqual(retried.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 1 });

  const ready = runApply('retry-reset-ready', retried.baton, output({ outcome: 'ready' }));
  assert.equal(ready.baton.cursor, 'approval_step');
  assert.equal(Object.hasOwn(ready.baton.state, 'attempts'), false);
});

test('apply: retry attempt counters stay reset across approval rework loops', () => {
  const retried = runApply('retry-reset-rework-first', baton(), output({ outcome: 'retry' }));
  assert.deepEqual(retried.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 1 });

  const ready = runApply('retry-reset-rework-ready', retried.baton, output({ outcome: 'ready' }));
  assert.equal(ready.baton.cursor, 'approval_step');
  assert.equal(Object.hasOwn(ready.baton.state, 'attempts'), false);

  const rejected = runApply(
    'retry-reset-rework-rejected',
    ready.baton,
    { approval: 'rejected', results: [{ type: 'approval', summary: 'needs rework' }] },
  );
  assert.equal(rejected.baton.cursor, 'worker_step');
  assert.equal(Object.hasOwn(rejected.baton.state, 'attempts'), false);

  const retriedAfterRework = runApply('retry-reset-rework-second', rejected.baton, output({ outcome: 'retry' }));
  assert.equal(retriedAfterRework.baton.cursor, 'worker_step');
  assert.deepEqual(retriedAfterRework.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 1 });
});

test('apply: retry attempt counters are scoped by transition value and target', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.rework = { target: 'worker_step', maxAttempts: 2, onLimit: 'blocked' };

  const retried = runApply('retry-scoped-retry', baton(), output({ outcome: 'retry' }), true, workflowDoc);
  assert.deepEqual(retried.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 1 });

  const reworked = runApply('retry-scoped-rework', retried.baton, output({ outcome: 'rework' }), true, workflowDoc);
  assert.deepEqual(reworked.baton.state.attempts, {
    'worker_step:outcome:retry->worker_step': 1,
    'worker_step:outcome:rework->worker_step': 1,
  });

  const retriedAgain = runApply('retry-scoped-retry-again', reworked.baton, output({ outcome: 'retry' }), true, workflowDoc);
  assert.deepEqual(retriedAgain.baton.state.attempts, {
    'worker_step:outcome:retry->worker_step': 2,
    'worker_step:outcome:rework->worker_step': 1,
  });
});

test('runtime: dangling workflow targets fail when the resolver uses them', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.ready = 'missing_target';
  const result = runApply('dangling-target', baton(), output(), false, workflowDoc);
  assert.match(result.stderr, /transition target not found in workflow: missing_target/);
});

test('runtime: dangling retry limit targets fail when the resolver uses them', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.retry.onLimit = 'missing_blocked';
  const first = runApply('dangling-retry-limit-first', baton(), output({ outcome: 'retry' }), true, workflowDoc);
  const second = runApply('dangling-retry-limit-second', first.baton, output({ outcome: 'retry' }), true, workflowDoc);
  const limited = runApply('dangling-retry-limit', second.baton, output({ outcome: 'retry' }), false, workflowDoc);
  assert.match(limited.stderr, /transition target not found in workflow: missing_blocked/);
});

test('runtime: dangling retry policy targets fail when the retry branch is selected', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.retry.target = 'missing_retry_target';

  const result = runApply('dangling-retry-policy-target', baton(), output({ outcome: 'retry' }), false, workflowDoc);

  assert.match(result.stderr, /transition target not found in workflow: missing_retry_target/);
});

test('schema validation: unsupported legacy vocabulary is rejected by the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.kind = 'subagent';
  workflowDoc.workflow.steps.worker_step.outcomes = { ready: 'approval_step' };
  const result = runInspect('legacy-vocabulary', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: unsupported step kind is rejected without relying on other shape errors', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.kind = 'subagent';

  const result = runInspect('unsupported-step-kind', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: nonterminal workflow steps require next in the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  delete workflowDoc.workflow.steps.worker_step.next;
  const result = runInspect('missing-next', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: worker steps require declared output template contract', () => {
  const missingOutput = structuredClone(schemaWorkflowDoc);
  delete missingOutput.workflow.steps.worker_step.output;
  assert.match(runInspect('worker-step-missing-output', baton(), false, missingOutput).stderr, /workflow failed schema validation/);
});

test('schema validation: worker output contract is template-only', () => {

  const withOutputTemplate = structuredClone(schemaWorkflowDoc);
  withOutputTemplate.workflow.steps.worker_step.output.template = '../../shared/templates/implementation-plan-template.md';
  const response = runInspect('worker-step-output-template', baton(), true, withOutputTemplate);
  assert.equal(response.directive.vertex.output.template, '../../shared/templates/implementation-plan-template.md');

  const emptyTemplateName = structuredClone(schemaWorkflowDoc);
  emptyTemplateName.workflow.steps.worker_step.output.template = '';
  assert.match(runInspect('worker-step-empty-output-template', baton(), false, emptyTemplateName).stderr, /workflow failed schema validation/);

  const obsoleteSchema = structuredClone(schemaWorkflowDoc);
  obsoleteSchema.workflow.steps.worker_step.output.schema = 'schemas/worker-output.json';
  assert.match(runInspect('worker-step-obsolete-output-schema', baton(), false, obsoleteSchema).stderr, /workflow failed schema validation/);

  const obsoleteFormat = structuredClone(schemaWorkflowDoc);
  obsoleteFormat.workflow.steps.worker_step.output.format = 'markdown';
  assert.match(runInspect('worker-step-obsolete-output-format', baton(), false, obsoleteFormat).stderr, /workflow failed schema validation/);

  const wrapperOwnedDetails = structuredClone(schemaWorkflowDoc);
  wrapperOwnedDetails.workflow.steps.worker_step.output.prompt = 'wrapper-owned-output-prompt.md';
  assert.match(runInspect('worker-step-output-wrapper-details', baton(), false, wrapperOwnedDetails).stderr, /workflow failed schema validation/);
});

test('schema validation: retry transition policies require complete bounded-loop shape', () => {
  const missingTarget = structuredClone(schemaWorkflowDoc);
  delete missingTarget.workflow.steps.worker_step.next.map.retry.target;
  assert.match(runInspect('retry-policy-missing-target', baton(), false, missingTarget).stderr, /workflow failed schema validation/);

  const missingOnLimit = structuredClone(schemaWorkflowDoc);
  delete missingOnLimit.workflow.steps.worker_step.next.map.retry.onLimit;
  assert.match(runInspect('retry-policy-missing-on-limit', baton(), false, missingOnLimit).stderr, /workflow failed schema validation/);

  const invalidMaxAttempts = structuredClone(schemaWorkflowDoc);
  invalidMaxAttempts.workflow.steps.worker_step.next.map.retry.maxAttempts = 0;
  assert.match(runInspect('retry-policy-invalid-max-attempts', baton(), false, invalidMaxAttempts).stderr, /workflow failed schema validation/);
});

test('schema validation: mapped transitions require selector and non-empty map', () => {
  const missingSelector = structuredClone(schemaWorkflowDoc);
  delete missingSelector.workflow.steps.worker_step.next.by;
  assert.match(runInspect('transition-map-missing-selector', baton(), false, missingSelector).stderr, /workflow failed schema validation/);

  const emptyMap = structuredClone(schemaWorkflowDoc);
  emptyMap.workflow.steps.worker_step.next.map = {};
  assert.match(runInspect('transition-map-empty-map', baton(), false, emptyMap).stderr, /workflow failed schema validation/);
});

test('schema validation: mapped transition objects reject unsupported control fields', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.default = 'blocked';

  const result = runInspect('transition-map-unsupported-default', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: mapped transition selector must be non-empty', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.by = '';

  const result = runInspect('transition-map-empty-selector', baton(), false, workflowDoc);

  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: transition target strings must be non-empty', () => {
  const emptyDirectTarget = structuredClone(schemaWorkflowDoc);
  emptyDirectTarget.workflow.steps.direct_next_worker.next = '';
  assert.match(runInspect('empty-direct-transition-target', baton({ cursor: 'direct_next_worker' }), false, emptyDirectTarget).stderr, /workflow failed schema validation/);

  const emptyMappedTarget = structuredClone(schemaWorkflowDoc);
  emptyMappedTarget.workflow.steps.worker_step.next.map.ready = '';
  assert.match(runInspect('empty-mapped-transition-target', baton(), false, emptyMappedTarget).stderr, /workflow failed schema validation/);
});

test('schema validation: workflow terminal and start target strings must be non-empty', () => {
  const emptyStart = structuredClone(schemaWorkflowDoc);
  emptyStart.workflow.start = '';
  assert.match(runInspect('empty-workflow-start-target', baton(), false, emptyStart).stderr, /workflow failed schema validation/);

  const emptyDone = structuredClone(schemaWorkflowDoc);
  emptyDone.workflow.done = '';
  assert.match(runInspect('empty-workflow-done-target', baton(), false, emptyDone).stderr, /workflow failed schema validation/);

  const emptyBlocked = structuredClone(schemaWorkflowDoc);
  emptyBlocked.workflow.blocked = '';
  assert.match(runInspect('empty-workflow-blocked-target', baton(), false, emptyBlocked).stderr, /workflow failed schema validation/);
});

test('schema validation: terminal steps reject outgoing transitions', () => {
  const doneWithNext = structuredClone(schemaWorkflowDoc);
  doneWithNext.workflow.steps.done.next = 'worker_step';
  assert.match(runInspect('terminal-done-with-next', baton({ cursor: 'done', status: 'done' }), false, doneWithNext).stderr, /workflow failed schema validation/);

  const blockedWithNext = structuredClone(schemaWorkflowDoc);
  blockedWithNext.workflow.steps.blocked.next = 'worker_step';
  assert.match(
    runInspect('terminal-blocked-with-next', baton({ cursor: 'blocked', status: 'blocked' }), false, blockedWithNext).stderr,
    /workflow failed schema validation/,
  );
});

test('schema validation: step input rejects wrapper-owned nested fields', () => {
  const workerInputExtension = structuredClone(schemaWorkflowDoc);
  workerInputExtension.workflow.steps.worker_step.input.operatorHints = { prompt: 'wrapper-owned-worker-prompt.md' };
  assert.match(runInspect('worker-input-wrapper-field', baton(), false, workerInputExtension).stderr, /workflow failed schema validation/);

  const terminalInputExtension = structuredClone(schemaWorkflowDoc);
  terminalInputExtension.workflow.steps.done.input.operatorHints = { prompt: 'wrapper-owned-done-prompt.md' };
  assert.match(runInspect('terminal-input-wrapper-field', baton({ cursor: 'done', status: 'done' }), false, terminalInputExtension).stderr, /workflow failed schema validation/);
});

test('schema validation: input state selectors must be unique non-empty strings', () => {
  const duplicateSelector = structuredClone(schemaWorkflowDoc);
  duplicateSelector.workflow.steps.worker_step.input.state = ['artifacts', 'artifacts'];
  assert.match(runInspect('duplicate-worker-state-selector', baton(), false, duplicateSelector).stderr, /workflow failed schema validation/);

  const emptyApprovalSelector = structuredClone(schemaWorkflowDoc);
  emptyApprovalSelector.workflow.steps.approval_step.input.state = [''];
  assert.match(runInspect('empty-approval-state-selector', baton({ cursor: 'approval_step' }), false, emptyApprovalSelector).stderr, /workflow failed schema validation/);
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
  missingStart.workflow.start = 'missing_start';
  assert.match(runInspect('missing-workflow-start-target', baton(), false, missingStart).stderr, /workflow start target not found: missing_start/);

  const missingDone = structuredClone(schemaWorkflowDoc);
  missingDone.workflow.done = 'missing_done';
  assert.match(runInspect('missing-workflow-done-target', baton(), false, missingDone).stderr, /workflow done target not found: missing_done/);

  const missingBlocked = structuredClone(schemaWorkflowDoc);
  missingBlocked.workflow.blocked = 'missing_blocked';
  assert.match(runInspect('missing-workflow-blocked-target', baton(), false, missingBlocked).stderr, /workflow blocked target not found: missing_blocked/);

  const donePointsToWorker = structuredClone(schemaWorkflowDoc);
  donePointsToWorker.workflow.done = 'worker_step';
  assert.match(runInspect('workflow-done-target-is-worker', baton(), false, donePointsToWorker).stderr, /workflow done target 'worker_step' must be a done step/);

  const blockedPointsToWorker = structuredClone(schemaWorkflowDoc);
  blockedPointsToWorker.workflow.blocked = 'worker_step';
  assert.match(
    runInspect('workflow-blocked-target-is-worker', baton(), false, blockedPointsToWorker).stderr,
    /workflow blocked target 'worker_step' must be a blocked step/,
  );
});

test('schema validation: retry policy target strings must be non-empty', () => {
  const emptyRetryTarget = structuredClone(schemaWorkflowDoc);
  emptyRetryTarget.workflow.steps.worker_step.next.map.retry.target = '';
  assert.match(runInspect('empty-retry-policy-target', baton(), false, emptyRetryTarget).stderr, /workflow failed schema validation/);

  const emptyRetryOnLimit = structuredClone(schemaWorkflowDoc);
  emptyRetryOnLimit.workflow.steps.worker_step.next.map.retry.onLimit = '';
  assert.match(runInspect('empty-retry-policy-on-limit', baton(), false, emptyRetryOnLimit).stderr, /workflow failed schema validation/);
});

test('schema validation: baton retry counters must be non-negative integers', () => {
  const fractionalAttempt = baton({ state: { artifacts: [], results: [], attempts: { 'worker_step:outcome:retry->worker_step': 1.5 } } });
  assert.match(runInspect('baton-fractional-retry-attempt', fractionalAttempt, false).stderr, /baton failed schema validation/);

  const negativeAttempt = baton({ state: { artifacts: [], results: [], attempts: { 'worker_step:outcome:retry->worker_step': -1 } } });
  assert.match(runInspect('baton-negative-retry-attempt', negativeAttempt, false).stderr, /baton failed schema validation/);
});

test('validation: worker and approval transition vocabularies stay distinct', () => {
  const workerUsingApproval = runApply('worker-using-approval', baton(), { approval: 'approved' }, false);
  const approvalUsingOutcome = runApply('approval-using-outcome', baton({ cursor: 'approval_step' }), { outcome: 'approved' }, false);
  assert.match(workerUsingApproval.stderr, /worker cursor 'worker_step' must use outcome/);
  assert.match(approvalUsingOutcome.stderr, /approval cursor 'approval_step' must use approval/);
});

test('validation: ambiguous outputs with both outcome and approval are rejected for typed steps', () => {
  const workerAmbiguous = runApply('worker-ambiguous-output', baton(), { outcome: 'ready', approval: 'approved' }, false);
  const approvalAmbiguous = runApply(
    'approval-ambiguous-output',
    baton({ cursor: 'approval_step' }),
    { approval: 'approved', outcome: 'ready' },
    false,
  );

  assert.match(workerAmbiguous.stderr, /worker cursor 'worker_step' must use outcome, not approval/);
  assert.match(approvalAmbiguous.stderr, /approval cursor 'approval_step' must use approval, not outcome/);
});

test('validation: empty mapped transition value is rejected before map lookup', () => {
  const result = runApply('empty-map-value', baton(), output({ outcome: '' }), false);
  assert.match(result.stderr, /cursor 'worker_step' transition field 'outcome' must be a non-empty string/);
});

test('validation: mapped transition selector missing from output is rejected clearly', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.by = 'decision';
  workflowDoc.workflow.steps.worker_step.next.map = { approve: 'approval_step' };

  const result = runApply('missing-transition-selector-field', baton(), output({ outcome: 'ready' }), false, workflowDoc);

  assert.match(result.stderr, /cursor 'worker_step' output missing transition field 'decision'/);
});

test('validation: approval mapped transition selector mismatch is rejected clearly', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.approval_step.next.by = 'decision';
  workflowDoc.workflow.steps.approval_step.next.map = { approve: 'direct_next_worker' };

  const result = runApply('approval-missing-transition-selector-field', baton({ cursor: 'approval_step' }), { approval: 'approved' }, false, workflowDoc);

  assert.match(result.stderr, /cursor 'approval_step' output missing transition field 'decision'/);
});

test('apply: mapped transition value string zero is accepted as a real map key', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map['0'] = 'approval_step';

  const response = runApply('zero-string-map-value', baton(), output({ outcome: '0' }), true, workflowDoc);
  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.directive.action, 'wait_for_approval');
});

test('validation: unknown mapped value and unknown cursor are rejected', () => {
  assert.match(runApply('unknown-map-value', baton(), output({ outcome: 'missing' }), false).stderr, /not allowed/);
  assert.match(runInspect('unknown-cursor', baton({ cursor: 'missing_step' }), false).stderr, /baton cursor not found/);
});

test('validation: unknown approval mapped value is rejected', () => {
  const result = runApply('unknown-approval-map-value', baton({ cursor: 'approval_step' }), { approval: 'deferred' }, false);
  assert.match(result.stderr, /transition value 'deferred' is not allowed from cursor 'approval_step' by 'approval'/);
});

test('cli: directive alias returns the same inspect directive shape', () => {
  const prefix = 'directive-alias';
  const batonPath = writeJson(`${prefix}-baton.json`, baton());
  const wfPath = writeJson(`${prefix}-workflow.json`, schemaWorkflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const response = expectCliResult(
    'directive-alias',
    runNode(['develop/scripts/workflow-interpreter.mjs', 'directive', wfPath, batonPath]),
    true,
  );

  assert.equal(response.directive.id, 'worker_step');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.kind, 'worker');
  assert.equal(readFileSync(batonPath, 'utf8'), before, 'directive alias mutated baton file');
});

test('cli: positional paths may begin with dash', () => {
  writeFileSync(path.join(tempDir, '--workflow.json'), `${JSON.stringify(schemaWorkflowDoc, null, 2)}\n`);
  writeFileSync(path.join(tempDir, '--baton.json'), `${JSON.stringify(baton(), null, 2)}\n`);

  const result = runNode(
    [path.join(root, 'develop/scripts/workflow-interpreter.mjs'), 'inspect', '--workflow.json', '--baton.json'],
    tempDir,
  );
  const response = expectCliResult('inspect-dash-prefixed-paths', result, true);
  assert.equal(response.directive.id, 'worker_step');
});

test('cli: legacy three-position apply mode still applies worker output', () => {
  const prefix = 'legacy-three-position-apply';
  const wfPath = writeJson(`${prefix}-workflow.json`, schemaWorkflowDoc);
  const batonPath = writeJson(`${prefix}-baton.json`, baton());
  const outputPath = writeJson(`${prefix}-output.json`, output());
  const before = readFileSync(batonPath, 'utf8');

  const response = expectCliResult('legacy-three-position-apply', runNode(['develop/scripts/workflow-interpreter.mjs', wfPath, batonPath, outputPath]), true);

  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.directive.action, 'wait_for_approval');
  assert.equal(readFileSync(batonPath, 'utf8'), before, 'legacy apply mode mutated baton file');
});

test('cli: schema validation rejects wrong arity with mode-specific usage', () => {
  const inspect = runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', 'workflow.json']);
  const apply = runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', 'workflow.json', 'baton.json']);
  const legacy = runNode(['develop/scripts/workflow-interpreter.mjs', 'workflow.json', 'baton.json']);

  assert.equal(inspect.status, 1);
  assert.match(inspect.stderr, /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json>/);

  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs apply <workflow\.json> <baton\.json> <worker-output\.json>/);

  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json> \| apply <workflow\.json> <baton\.json> <worker-output\.json>/);
});

test('cli: unknown explicit mode with apply arity is rejected by argument schema', () => {
  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'bogus', 'workflow.json', 'baton.json', 'output.json']);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json> \| apply <workflow\.json> <baton\.json> <worker-output\.json>/,
  );
});
