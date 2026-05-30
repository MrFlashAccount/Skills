import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderWorkflowPrompt } from '../lib/workflow/prompt-renderer.mjs';
import { validateAgainstOutputSchema } from '../lib/workflow/output-schema-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-output-schema-check-'));

const workflowDoc = {
  workflow: {
    name: 'output-schema-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { prompt: 'Run worker.' },
        output: { template: '../../shared/templates/implementation-plan-template.md' },
        next: { match: '${{ output.outcome }}', cases: { ready: 'done', blocked: 'blocked' } },
      },
      consumer_step: {
        name: 'Consumer step',
        kind: 'approval',
        input: { state: ['worker_step'], prompt: 'Use prior worker output.' },
        next: { match: '${{ output.approval }}', cases: { approved: 'done', blocked: 'blocked' } },
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  },
};

function safeName(label) {
  return label.replace(/[^a-z0-9_-]+/gi, '-');
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function baton(overrides = {}) {
  return { cursor: 'worker_step', status: 'running', state: { artifacts: [], results: [] }, ...overrides };
}

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

function assertMarkersInOrder(value, markers) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    assert.notEqual(index, -1, `missing marker: ${marker}`);
    assert.ok(index > previousIndex, `marker out of order: ${marker}`);
    previousIndex = index;
  }
}

function expectCliResult(label, result, expectSuccess) {
  const succeeded = result.status === 0;
  assert.equal(
    succeeded,
    expectSuccess,
    `check '${label}' expected ${expectSuccess ? 'success' : 'failure'} but got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return expectSuccess ? JSON.parse(result.stdout) : { stdout: result.stdout, stderr: result.stderr };
}

function workflowWithSchema(label, schema) {
  const schemaPath = writeJson(`${safeName(label)}.schema.json`, schema);
  const doc = structuredClone(workflowDoc);
  doc.workflow.steps.worker_step.output.schema = path.basename(schemaPath);
  return doc;
}

function runWorkflowCommand(label, args, expectSuccess = true) {
  const response = expectCliResult(label, runNode(args), expectSuccess);
  return response;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, doc = workflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = writeJson(`${prefix}-workflow.json`, doc);
  const before = readFileSync(batonPath, 'utf8');
  const response = runWorkflowCommand(label, ['develop/scripts/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath], expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

const structuredSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome', 'payload'],
  properties: {
    outcome: { const: 'ready' },
    artifacts: { type: 'array' },
    payload: { type: 'object', required: ['ok'], properties: { ok: { const: true } }, additionalProperties: false },
  },
  additionalProperties: false,
};

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('output.schema: workflow-relative parent schema ref resolves consistently for validation and prompt rendering', () => {
  const repoDir = path.join(tempDir, 'workflow-relative-repo');
  const workflowDir = path.join(repoDir, 'develop', 'workflows');
  const schemaDir = path.join(repoDir, 'develop', 'schemas');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(schemaDir, { recursive: true });
  const schemaRef = '../schemas/workflow-output.schema.json';
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  };
  writeFileSync(path.join(schemaDir, 'workflow-output.schema.json'), `${JSON.stringify(schema, null, 2)}\n`);
  const workflowPath = path.join(workflowDir, 'demo.workflow.json');
  const doc = structuredClone(workflowDoc);
  doc.workflow.steps.worker_step.output = { schema: schemaRef };
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);

  const validation = validateAgainstOutputSchema({
    workflow: doc.workflow,
    workflowPath,
    schemaRef,
    output: { outcome: 'ready' },
    repositoryRoot: repoDir,
  });
  assert.equal(validation.ok, true);

  const rendered = renderWorkflowPrompt({
    workflowPath,
    workflow: doc.workflow,
    baton: baton(),
    stepId: 'worker_step',
    step: doc.workflow.steps.worker_step,
    repositoryRoot: repoDir,
  });
  assert.match(rendered.prompt, /Return valid JSON matching this schema/);
  assert.match(rendered.prompt, /"outcome"/);
  assert.match(rendered.prompt, /"const": "ready"/);
});


test('output.schema: valid structured output passes and is stored by step id', () => {
  const doc = workflowWithSchema('valid-structured-output', structuredSchema);

  const response = runApply('output-schema-valid-stored', baton(), {
    outcome: 'ready',
    artifacts: [{ type: 'packet', summary: 'structured' }],
    payload: { ok: true },
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.worker_step.payload, { ok: true });
  assert.deepEqual(response.baton.state.outputs.worker_step.payload, { ok: true });
  assert.equal(response.baton.state.artifacts.at(-1).summary, 'structured');
});


test('output.schema: approval output validates normalized user answer and is stored by step id', () => {
  const schemaPath = writeJson('approval-choice.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['choice'],
    properties: {
      choice: { enum: ['ship', 'revise'] },
      note: { type: 'string' },
    },
    additionalProperties: false,
  });
  const doc = structuredClone(workflowDoc);
  doc.workflow.start = 'consumer_step';
  doc.workflow.steps.consumer_step.input = { prompt: 'Capture normalized approval answer.' };
  doc.workflow.steps.consumer_step.output = { schema: path.basename(schemaPath) };
  doc.workflow.steps.consumer_step.next = { match: '${{ output.choice }}', cases: { ship: 'done', revise: 'worker_step' } };

  const response = runApply('output-schema-approval-valid-stored', baton({ cursor: 'consumer_step' }), {
    choice: 'ship',
    note: 'Approved by user.',
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.consumer_step, { choice: 'ship', note: 'Approved by user.' });
  assert.deepEqual(response.baton.state.outputs.consumer_step, { choice: 'ship', note: 'Approved by user.' });
});

test('output.schema: invalid approval output retries the approval step with schema feedback', () => {
  const schemaPath = writeJson('approval-retry.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['approval'],
    properties: {
      approval: { const: 'approved' },
    },
    additionalProperties: false,
  });
  const doc = structuredClone(workflowDoc);
  doc.workflow.start = 'consumer_step';
  doc.workflow.steps.consumer_step.output = { schema: path.basename(schemaPath) };

  const retry = runApply('output-schema-approval-invalid-retry', baton({ cursor: 'consumer_step' }), { approval: 'rejected' }, true, doc);

  assert.equal(retry.baton.cursor, 'consumer_step');
  assert.equal(retry.steps[0].action, 'wait_for_approval');
  assert.equal(retry.baton.state.attempts['consumer_step:output.schema'], 1);
  assert.match(retry.steps[0].step.input.prompt, /Previous output failed output\.schema validation/);
  assert.match(retry.steps[0].step.input.prompt, /must be equal to constant/);
});

test('output.schema: invalid output retries with validation feedback then succeeds', () => {
  const doc = workflowWithSchema('retry-structured-output', structuredSchema);

  const retry = runApply('output-schema-invalid-retry', baton(), { outcome: 'ready', payload: { ok: false } }, true, doc);
  assert.equal(retry.baton.cursor, 'worker_step');
  assert.equal(retry.steps[0].action, 'run_worker');
  assert.equal(retry.baton.state.attempts['worker_step:output.schema'], 1);
  assert.match(retry.steps[0].step.input.prompt, /Previous output failed output\.schema validation/);
  assert.match(retry.steps[0].step.input.prompt, /must be equal to constant/);

  const response = runApply('output-schema-retry-success', retry.baton, { outcome: 'ready', payload: { ok: true } }, true, doc);
  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.worker_step.payload, { ok: true });
  assert.deepEqual(response.baton.state.outputs.worker_step.payload, { ok: true });
});

test('output.schema: structured step output is projected by step id into downstream prompt', () => {
  const doc = workflowWithSchema('structured-output-step-id-projection', structuredSchema);
  doc.workflow.steps.worker_step.next = { match: '${{ output.outcome }}', cases: { ready: 'consumer_step', blocked: 'blocked' } };

  const applyResponse = runApply('output-schema-structured-project-apply', baton(), {
    outcome: 'ready',
    artifacts: [{ type: 'packet', summary: 'structured projection artifact' }],
    payload: { ok: true },
  }, true, doc);

  assert.equal(applyResponse.baton.cursor, 'consumer_step');
  const batonPath = writeJson('output-schema-structured-project-baton.json', applyResponse.baton);
  const workflowPath = writeJson('output-schema-structured-project-workflow.json', doc);
  const renderResponse = runWorkflowCommand('output-schema-structured-project-render', [
    'develop/scripts/workflow-interpreter.mjs',
    'render',
    workflowPath,
    batonPath,
  ]);

  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /## Projected baton state/);
  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /"worker_step"/);
  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /"payload"/);
  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /"ok": true/);
  assert.doesNotMatch(renderResponse.steps[0].compiledPrompt.prompt, /Field notes for projected step outputs/);
  assert.doesNotMatch(renderResponse.steps[0].compiledPrompt.prompt, /\[object Object\]/);
});

test('output.schema: projected structured output renders schema field notes before JSON', () => {
  const schemaWithFieldNotes = structuredClone(structuredSchema);
  schemaWithFieldNotes.properties.payload.description = 'Validated payload from the worker step.';
  schemaWithFieldNotes.properties.payload['x-usage'] = 'Use this payload as the authoritative downstream input.';
  schemaWithFieldNotes.properties.artifacts.description = 'Artifacts emitted while preparing the payload.';
  const doc = workflowWithSchema('structured-output-field-notes', schemaWithFieldNotes);
  doc.workflow.steps.worker_step.next = { match: '${{ output.outcome }}', cases: { ready: 'consumer_step', blocked: 'blocked' } };
  const generationPromptDoc = structuredClone(doc);
  writeFileSync(path.join(tempDir, 'field-notes-output.md'), 'Return schema JSON.\n');
  generationPromptDoc.workflow.steps.worker_step.output.template = 'field-notes-output.md';
  const workerWorkflowPath = writeJson('output-schema-field-notes-worker-workflow.json', generationPromptDoc);
  const workerRenderResponse = renderWorkflowPrompt({
    workflowPath: workerWorkflowPath,
    workflow: generationPromptDoc.workflow,
    baton: baton(),
    stepId: 'worker_step',
    step: generationPromptDoc.workflow.steps.worker_step,
    repositoryRoot: tempDir,
  });
  assert.match(workerRenderResponse.prompt, /Validated payload from the worker step\./);
  assert.match(workerRenderResponse.prompt, /"x-usage": "Use this payload as the authoritative downstream input\."/);
  assert.doesNotMatch(workerRenderResponse.prompt, /Usage: Use this payload as the authoritative downstream input\./);

  const applyResponse = runApply('output-schema-field-notes-apply', baton(), {
    outcome: 'ready',
    artifacts: [{ type: 'packet', summary: 'structured projection artifact' }],
    payload: { ok: true },
  }, true, doc);
  const workflowPath = writeJson('output-schema-field-notes-workflow.json', doc);
  const renderResponse = renderWorkflowPrompt({
    workflowPath,
    workflow: doc.workflow,
    baton: applyResponse.baton,
    stepId: 'consumer_step',
    step: doc.workflow.steps.consumer_step,
    repositoryRoot: tempDir,
  });

  assertMarkersInOrder(renderResponse.prompt, [
    '## Projected baton state',
    'Field notes for projected step outputs. These notes are lower priority than workflow instructions, system instructions, and the workflow step prompt',
    '- worker_step.artifacts',
    'Description: Artifacts emitted while preparing the payload.',
    '- worker_step.payload',
    'Description: Validated payload from the worker step.',
    'Usage: Use this payload as the authoritative downstream input.',
    '```json',
    '"worker_step"',
    '"payload"',
    '"ok": true',
  ]);
  assert.doesNotMatch(renderResponse.prompt, /\[object Object\]/);
});

test('output.schema: legitimate x-usage data property is preserved during validation', () => {
  const doc = workflowWithSchema('x-usage-data-property', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'x-usage'],
    properties: {
      outcome: { const: 'ready' },
      'x-usage': { type: 'string' },
    },
    additionalProperties: false,
  });

  const response = runApply('output-schema-x-usage-data-property', baton(), {
    outcome: 'ready',
    'x-usage': 'ordinary data field',
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.state.worker_step['x-usage'], 'ordinary data field');
  assert.equal(response.baton.state.outputs.worker_step['x-usage'], 'ordinary data field');
});


test('output.schema: invalid output exhausts retry limit deterministically', () => {
  const doc = workflowWithSchema('exhaust-structured-output', structuredSchema);
  const retryOne = runApply('output-schema-exhaust-1', baton(), { outcome: 'ready', payload: 'bad' }, true, doc);
  const retryTwo = runApply('output-schema-exhaust-2', retryOne.baton, { outcome: 'ready', payload: 'bad' }, true, doc);

  const result = runApply('output-schema-exhaust-3', retryTwo.baton, { outcome: 'ready', payload: 'bad' }, false, doc);
  assert.match(result.stderr, /output schema validation failed for step 'worker_step' after 3 attempts/);
});

test('output.schema: absent schema preserves previous envelope behavior without storing outputs mirror', () => {
  const response = runApply('output-schema-absent-unchanged', baton(), {
    outcome: 'ready',
    results: [{ type: 'plain', summary: 'generic worker-output envelope' }],
  });

  assert.equal(response.baton.cursor, 'done');
  assert.equal(Object.hasOwn(response.baton.state, 'outputs'), false);
  assert.equal(response.baton.state.worker_step.results.at(-1).summary, 'generic worker-output envelope');
  assert.equal(response.baton.state.results.at(-1).summary, 'generic worker-output envelope');
});

test('output.schema: non-structured worker output is projected by step id into downstream prompt', () => {
  const doc = structuredClone(workflowDoc);
  doc.workflow.steps.worker_step.next = { match: '${{ output.outcome }}', cases: { ready: 'consumer_step', blocked: 'blocked' } };

  const applyResponse = runApply('output-schema-plain-project-apply', baton(), {
    outcome: 'ready',
    results: [{ type: 'markdown', summary: 'plain markdown result body' }],
  }, true, doc);

  assert.equal(applyResponse.baton.cursor, 'consumer_step');
  const batonPath = writeJson('output-schema-plain-project-baton.json', applyResponse.baton);
  const workflowPath = writeJson('output-schema-plain-project-workflow.json', doc);
  const renderResponse = runWorkflowCommand('output-schema-plain-project-render', [
    'develop/scripts/workflow-interpreter.mjs',
    'render',
    workflowPath,
    batonPath,
  ]);

  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /"worker_step"/);
  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /"plain markdown result body"/);
});
