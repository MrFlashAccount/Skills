import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderWorkflowPrompt } from '../entities/Template/index.mjs';
import { SchemaValidationError } from '../../../../shared/scripts/schema-validation/schema-validation.mjs';
import { validateAgainstOutputSchema as validateLoadedOutputSchema } from '../use-cases/runtime/output/output-schema-validation.mjs';
import { loadWorkflowResources } from '../persistence/workflow-resources/runtime-reader.mjs';
import { artifactPathBoundaryErrors } from '../persistence/workflow-resources/artifact-path-boundaries.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-output-schema-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
writeFileSync(path.join(tempDir, 'worker-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: { outcome: { enum: ['ready', 'blocked'] }, results: { type: 'array' }, artifacts: { type: 'array' } },
  additionalProperties: true,
}, null, 2)}\n`);

const workflowDoc = {
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
        output: { template: 'output.md', schema: 'worker-output.schema.json' },
        next: { match: '${{ output.outcome }}', cases: { ready: 'done', blocked: 'blocked' } },
      },
      consumer_step: {
        name: 'Consumer step',
        kind: 'approval',
        input: { prompt: 'Use prior worker output.' },
        next: { match: '${{ output.approval }}', cases: { approved: 'done', blocked: 'blocked' } },
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
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

function renderPromptWithResources(context) {
  return renderWorkflowPrompt({
    ...context,
    resources: context.resources ?? loadWorkflowResources(context),
  });
}

function validateAgainstOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot = root, schema, externalSchemas, ...context }) {
  const loadedSchema = schema ?? (workflow && workflowPath && schemaRef
    ? loadWorkflowResources({ workflow, workflowPath, repositoryRoot }).outputSchemas[schemaRef]?.schema
    : undefined);
  return validateLoadedOutputSchema({
    ...context,
    schemaRef,
    schema: loadedSchema,
    externalSchemas,
  });
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
  doc.steps.worker_step.output.schema = path.basename(schemaPath);
  doc.steps.worker_step.next.cases = { ready: doc.steps.worker_step.next.cases.ready };
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
  const response = runWorkflowCommand(label, ['skills/orbita/lib/tests/helpers/workflow-runtime-harness.mjs', 'apply', wfPath, batonPath, outputPath], expectSuccess);
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

test('output.schema: workflow-package schema ref resolves consistently for validation and prompt rendering', () => {
  const repoDir = path.join(tempDir, 'workflow-package-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const schemaDir = path.join(workflowDir, 'schemas');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  const schemaRef = 'schemas/workflow-output.schema.json';
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  };
  writeFileSync(path.join(schemaDir, 'workflow-output.schema.json'), `${JSON.stringify(schema, null, 2)}\n`);
  const workflowPath = path.join(workflowDir, 'demo.json');
  const doc = structuredClone(workflowDoc);
  doc.steps.worker_step.output = { schema: schemaRef };
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);

  const validation = validateAgainstOutputSchema({
    workflow: doc,
    workflowPath,
    schemaRef,
    output: { outcome: 'ready' },
    repositoryRoot: repoDir,
  });
  assert.equal(validation.ok, true);

  const rendered = renderPromptWithResources({
    workflowPath,
    workflow: doc,
    baton: baton(),
    stepId: 'worker_step',
    step: doc.steps.worker_step,
    repositoryRoot: repoDir,
  });
  assert.match(rendered.prompt, /Generate strict JSON matching this schema/);
  assert.match(rendered.prompt, /"outcome"/);
  assert.match(rendered.prompt, /"const": "ready"/);
});


test('output.schema: CLI apply rejects workflow schema refs escaping repository root', () => {
  const repoDir = path.join(tempDir, 'cli-apply-schema-boundary-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const outsideDir = path.join(tempDir, 'cli-apply-schema-boundary-outside');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  const schemaPath = path.join(outsideDir, 'escape.schema.json');
  writeFileSync(path.join(workflowDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeFileSync(schemaPath, JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }));

  const doc = structuredClone(workflowDoc);
  doc.steps.worker_step.output = { template: 'output.md', schema: path.relative(workflowDir, schemaPath) };
  const workflowPath = path.join(workflowDir, 'workflow.json');
  const batonPath = path.join(workflowDir, 'baton.json');
  const outputPath = path.join(workflowDir, 'output.json');
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}
`);
  writeFileSync(batonPath, `${JSON.stringify(baton(), null, 2)}
`);
  writeFileSync(outputPath, `${JSON.stringify({ outcome: 'ready' }, null, 2)}
`);

  const result = runNode(['skills/orbita/lib/tests/helpers/workflow-runtime-harness.mjs', 'apply', workflowPath, batonPath, outputPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output schema escapes repository root/);
});


test('output.schema: CLI apply allows workflow-relative traversal to repo shared resources', () => {
  const repoDir = path.join(tempDir, 'cli-apply-schema-shared-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const sharedDir = path.join(repoDir, 'shared');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeFileSync(path.join(sharedDir, 'shared.schema.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }));

  const doc = structuredClone(workflowDoc);
  doc.steps.worker_step.output = { template: 'output.md', schema: '../../shared/shared.schema.json' };
  doc.steps.worker_step.next.cases = { ready: 'done' };
  const workflowPath = path.join(workflowDir, 'workflow.json');
  const batonPath = path.join(workflowDir, 'baton.json');
  const outputPath = path.join(workflowDir, 'output.json');
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(batonPath, `${JSON.stringify(baton(), null, 2)}\n`);
  writeFileSync(outputPath, `${JSON.stringify({ outcome: 'ready' }, null, 2)}\n`);

  const result = runNode(['skills/orbita/lib/tests/helpers/workflow-runtime-harness.mjs', 'apply', workflowPath, batonPath, outputPath]);

  assert.equal(result.status, 0, result.stderr);
});

test('output.schema: CLI apply rejects root-level workflow refs escaping workflow directory', () => {
  const repoDir = path.join(tempDir, 'cli-apply-schema-root-boundary-repo');
  const outsideDir = path.join(tempDir, 'cli-apply-schema-root-boundary-outside');
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(path.join(repoDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeFileSync(path.join(outsideDir, 'escape.schema.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }));

  const doc = structuredClone(workflowDoc);
  doc.steps.worker_step.output = { template: 'output.md', schema: '../cli-apply-schema-root-boundary-outside/escape.schema.json' };
  const workflowPath = path.join(repoDir, 'workflow.json');
  const batonPath = path.join(repoDir, 'baton.json');
  const outputPath = path.join(repoDir, 'output.json');
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(batonPath, `${JSON.stringify(baton(), null, 2)}\n`);
  writeFileSync(outputPath, `${JSON.stringify({ outcome: 'ready' }, null, 2)}\n`);

  const result = runNode(['skills/orbita/lib/tests/helpers/workflow-runtime-harness.mjs', 'apply', workflowPath, batonPath, outputPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output schema escapes repository root/);
});

test('output.schema: validate-workflow rejects schema refs escaping default repository root', () => {
  const repoDir = path.join(tempDir, 'validate-workflow-schema-boundary-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const outsideDir = path.join(tempDir, 'validate-workflow-schema-boundary-outside');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeFileSync(path.join(outsideDir, 'escape.schema.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }));

  const doc = structuredClone(workflowDoc);
  doc.steps.worker_step.output = { template: 'output.md', schema: path.relative(workflowDir, path.join(outsideDir, 'escape.schema.json')) };
  const workflowPath = path.join(workflowDir, 'workflow.json');
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);

  const result = runNode(['skills/orbita/lib/entrypoints/cli/validate-workflow.mjs', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output schema escapes repository root/);
});

test('output.schema: invalid JSON Schema throws controlled workflow error', () => {
  const doc = workflowWithSchema('invalid-json-schema-controlled-error', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 42,
  });

  assert.throws(
    () => validateAgainstOutputSchema({
      workflow: doc,
      workflowPath: path.join(tempDir, 'invalid-json-schema-controlled-error-workflow.json'),
      schemaRef: doc.steps.worker_step.output.schema,
      output: { outcome: 'ready' },
      repositoryRoot: tempDir,
    }),
    (error) => error instanceof SchemaValidationError
      && error.message.includes("output schema validation failed: invalid output schema 'invalid-json-schema-controlled-error.schema.json'"),
  );
});


test('output.schema: valid structured output passes and is stored by step id', () => {
  const doc = workflowWithSchema('valid-structured-output', structuredSchema);

  const response = runApply('output-schema-valid-stored', baton(), {
    outcome: 'ready',
    artifacts: [{ id: 'packet', content_type: 'text/markdown', path: '/runs/worker_step/artifacts/packet.md', summary: 'structured' }],
    payload: { ok: true },
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.worker_step.payload, { ok: true });
  assert.equal(response.baton.state.artifacts.at(-1).artifact.summary, 'structured');
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
  doc.start = 'consumer_step';
  doc.steps.consumer_step.input = { prompt: 'Capture normalized approval answer.' };
  doc.steps.consumer_step.output = { schema: path.basename(schemaPath) };
  doc.steps.consumer_step.next = { match: '${{ output.choice }}', cases: { ship: 'done', revise: 'worker_step' } };

  const response = runApply('output-schema-approval-valid-stored', baton({ cursor: 'consumer_step' }), {
    choice: 'ship',
    note: 'Approved by user.',
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.consumer_step, { choice: 'ship', note: 'Approved by user.' });
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
  doc.start = 'consumer_step';
  doc.steps.consumer_step.output = { schema: path.basename(schemaPath) };
  doc.steps.consumer_step.next.cases = { approved: 'done' };

  const retry = runApply('output-schema-approval-invalid-retry', baton({ cursor: 'consumer_step' }), { approval: 'rejected' }, true, doc);

  assert.equal(retry.baton.cursor, 'consumer_step');
  assert.equal(retry.steps[0].action, 'wait_for_approval');
  assert.equal(retry.baton.state.attempts['consumer_step:output.schema'], 1);
  assert.match(retry.steps[0].step.input.prompt, /Previous output failed output\.schema validation/);
  assert.match(retry.steps[0].step.input.prompt, /must be equal to constant/);
});



test('output.schema: loose artifacts item schema still enforces central artifact metadata contract', () => {
  const doc = workflowWithSchema('loose-artifacts-central-contract', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: { type: 'array', items: { type: 'object' } },
    },
    additionalProperties: false,
  });

  for (const forbiddenField of ['type', 'kind', 'ref', 'producer_step_id', 'version', 'replaces', 'aliases']) {
    const retry = runApply(`output-schema-loose-artifact-rejects-${forbiddenField}`, baton(), {
      outcome: 'ready',
      artifacts: [{ id: 'packet', content_type: 'text/plain', [forbiddenField]: forbiddenField === 'version' ? 1 : 'legacy' }],
    }, true, doc);

    assert.equal(retry.baton.cursor, 'worker_step');
    assert.equal(retry.steps[0].action, 'run_worker');
    assert.match(retry.steps[0].step.input.prompt, new RegExp(`/artifacts/0.*${forbiddenField}`));
  }
});

test('output.schema: reserved aggregate fields must keep array envelope shape', () => {
  const doc = workflowWithSchema('reserved-artifacts-object', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: { type: 'object', required: ['payload'], properties: { payload: { const: true } }, additionalProperties: false },
    },
    additionalProperties: false,
  });

  const retry = runApply('output-schema-reserved-artifacts-object', baton(), {
    outcome: 'ready',
    artifacts: { payload: true },
  }, true, doc);

  assert.equal(retry.baton.cursor, 'worker_step');
  assert.equal(retry.steps[0].action, 'run_worker');
  assert.equal(retry.baton.state.attempts['worker_step:output.schema'], 1);
  assert.match(retry.steps[0].step.input.prompt, /\/artifacts must be array/);
});


test('output.schema: schema-declared output still must be an object envelope', () => {
  const doc = workflowWithSchema('root-envelope-object', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  });
  doc.steps.worker_step.next = ['consumer_step'];
  doc.steps.consumer_step.next = 'join_step';
  doc.steps.join_step = {
    name: 'Join step',
    kind: 'worker',
    input: { prompt: 'Join consumer output.' },
    output: { template: 'output.md' },
    next: 'done',
  };

  const retry = runApply('output-schema-root-envelope-object', baton(), 'ready', true, doc);

  assert.equal(retry.baton.cursor, 'worker_step');
  assert.equal(retry.steps[0].action, 'run_worker');
  assert.equal(retry.baton.state.attempts['worker_step:output.schema'], 1);
  assert.match(retry.steps[0].step.input.prompt, /\/ must be object/);
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
});

test('output.schema: structured step output is available by step id in downstream prompt', () => {
  const doc = workflowWithSchema('structured-output-step-id-prompt-input', structuredSchema);
  doc.steps.worker_step.next = { match: '${{ output.outcome }}', cases: { ready: 'consumer_step' } };
  doc.steps.consumer_step.input.prompt = 'Use prior worker payload:\n${{ input.worker_step.payload }}';

  const applyResponse = runApply('output-schema-structured-project-apply', baton(), {
    outcome: 'ready',
    artifacts: [{ id: 'packet', content_type: 'text/markdown', path: path.join(tempDir, 'worker_step', 'artifacts', 'packet.md'), summary: 'structured prompt input artifact' }],
    payload: { ok: true },
  }, true, doc);

  assert.equal(applyResponse.baton.cursor, 'consumer_step');
  mkdirSync(path.join(tempDir, 'worker_step', 'artifacts'), { recursive: true });
  writeFileSync(path.join(tempDir, 'worker_step', 'artifacts', 'packet.md'), 'Structured prompt input artifact body.\n');
  const batonPath = writeJson('output-schema-structured-project-baton.json', applyResponse.baton);
  const workflowPath = writeJson('output-schema-structured-project-workflow.json', doc);
  const renderResponse = runWorkflowCommand('output-schema-structured-project-render', [
    'skills/orbita/lib/tests/helpers/workflow-runtime-harness.mjs',
    'render',
    workflowPath,
    batonPath,
  ]);

  assert.doesNotMatch(renderResponse.steps[0].compiledPrompt.prompt, /## Prompt input context/);
  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /Use prior worker payload:/);
  assert.match(renderResponse.steps[0].compiledPrompt.prompt, /"ok": true/);
  assert.doesNotMatch(renderResponse.steps[0].compiledPrompt.prompt, /Field notes for prompt input step outputs/);
  assert.doesNotMatch(renderResponse.steps[0].compiledPrompt.prompt, /\[object Object\]/);
});

test('output.schema: inline prompt input structured output omits automatic schema field notes', () => {
  const schemaWithFieldNotes = structuredClone(structuredSchema);
  schemaWithFieldNotes.properties.payload.description = 'Validated payload from the worker step.';
  schemaWithFieldNotes.properties.payload['x-usage'] = 'Use this payload as the authoritative downstream input.';
  schemaWithFieldNotes.properties.artifacts.description = 'Artifacts emitted while preparing the payload.';
  const doc = workflowWithSchema('structured-output-field-notes', schemaWithFieldNotes);
  doc.steps.worker_step.next = { match: '${{ output.outcome }}', cases: { ready: 'consumer_step' } };
  doc.steps.consumer_step.input.prompt = 'Use prompt input payload:\n${{ input.worker_step.payload }}';
  const generationPromptDoc = structuredClone(doc);
  writeFileSync(path.join(tempDir, 'field-notes-output.md'), 'Return schema JSON.\n');
  generationPromptDoc.steps.worker_step.output.template = 'field-notes-output.md';
  const workerWorkflowPath = writeJson('output-schema-field-notes-worker-workflow.json', generationPromptDoc);
  const workerRenderResponse = renderPromptWithResources({
    workflowPath: workerWorkflowPath,
    workflow: generationPromptDoc,
    baton: baton(),
    stepId: 'worker_step',
    step: generationPromptDoc.steps.worker_step,
    repositoryRoot: tempDir,
  });
  assert.match(workerRenderResponse.prompt, /Validated payload from the worker step\./);
  assert.match(workerRenderResponse.prompt, /"x-usage": "Use this payload as the authoritative downstream input\."/);
  assert.doesNotMatch(workerRenderResponse.prompt, /Usage: Use this payload as the authoritative downstream input\./);

  const applyResponse = runApply('output-schema-field-notes-apply', baton(), {
    outcome: 'ready',
    artifacts: [{ id: 'packet', content_type: 'text/markdown', path: path.join(tempDir, 'worker_step', 'artifacts', 'packet.md'), summary: 'structured prompt input artifact' }],
    payload: { ok: true },
  }, true, doc);
  const workflowPath = writeJson('output-schema-field-notes-workflow.json', doc);
  const renderResponse = renderPromptWithResources({
    workflowPath,
    workflow: doc,
    baton: applyResponse.baton,
    stepId: 'consumer_step',
    step: doc.steps.consumer_step,
    repositoryRoot: tempDir,
  });

  assertMarkersInOrder(renderResponse.prompt, [
    '## Workflow step prompt',
    'Use prompt input payload:',
    '```json',
    '"ok": true',
  ]);
  assert.doesNotMatch(renderResponse.prompt, /## Prompt input context/);
  assert.doesNotMatch(renderResponse.prompt, /Field notes for prompt input step outputs/);
  assert.doesNotMatch(renderResponse.prompt, /Usage: Use this payload as the authoritative downstream input\./);
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
});


test('output.schema: invalid output exhausts retry limit deterministically', () => {
  const doc = workflowWithSchema('exhaust-structured-output', structuredSchema);
  const retryOne = runApply('output-schema-exhaust-1', baton(), { outcome: 'ready', payload: 'bad' }, true, doc);
  const retryTwo = runApply('output-schema-exhaust-2', retryOne.baton, { outcome: 'ready', payload: 'bad' }, true, doc);

  const result = runApply('output-schema-exhaust-3', retryTwo.baton, { outcome: 'ready', payload: 'bad' }, false, doc);
  assert.match(result.stderr, /output schema validation failed for step 'worker_step' after 3 attempts/);
});

test('output.schema: absent schema preserves generic worker-output envelope behavior', () => {
  const doc = structuredClone(workflowDoc);
  delete doc.steps.worker_step.output.schema;
  doc.steps.worker_step.next = 'done';
  const response = runApply('output-schema-absent-unchanged', baton(), {
    outcome: 'ready',
    results: [{ type: 'plain', summary: 'generic worker-output envelope' }],
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.state.worker_step.results.at(-1).summary, 'generic worker-output envelope');
  assert.equal(response.baton.state.results.at(-1).summary, 'generic worker-output envelope');
});

test('output.schema: prompt expressions reject schema-less producer steps', () => {
  const doc = structuredClone(workflowDoc);
  delete doc.steps.worker_step.output.schema;
  doc.steps.worker_step.next = 'consumer_step';
  doc.steps.consumer_step.input.prompt = 'Use prior worker output:\n${{ input.worker_step }}';

  const response = runApply('output-schema-schema-less-prompt-ref', baton(), {
    outcome: 'ready',
    results: [{ type: 'markdown', summary: 'plain markdown result body' }],
  }, false, doc);

  assert.match(response.stderr, /input\.prompt expression \$\{\{ input\.worker_step \}\} has no schema-covered path/);
  assert.match(response.stderr, /input step 'worker_step' has no output\.schema/);
});

test('output.schema: central artifact contract accepts simplified shape and rejects legacy artifact fields', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: {
        type: 'array',
        items: { $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact' },
      },
    },
    additionalProperties: false,
  };

  assert.equal(validateAgainstOutputSchema({ schema, output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: '/runs/worker_step/artifacts/packet.md' }] } }).ok, true);

  for (const staleField of ['type', 'kind', 'ref', 'producer_step_id', 'version', 'replaces', 'aliases']) {
    const validation = validateAgainstOutputSchema({
      schema,
      output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: '/runs/worker_step/artifacts/packet.md', [staleField]: staleField === 'aliases' ? [] : 'legacy' }] },
    });
    assert.equal(validation.ok, false, `expected stale artifact field '${staleField}' to be rejected`);
    assert.match(validation.errors, /must NOT have additional properties/);
  }

  const missingPath = validateAgainstOutputSchema({ schema, output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown' }] } });
  assert.equal(missingPath.ok, false);
  assert.match(missingPath.errors, /path/);

  const relativePath = validateAgainstOutputSchema({ schema, output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: 'plan/artifacts/plan.md' }] } });
  assert.equal(relativePath.ok, false);
  assert.match(relativePath.errors, /path/);
});

test('output.schema: contextual artifact validation requires paths under the expected artifact output directory', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: {
        type: 'array',
        items: { $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact' },
      },
    },
    additionalProperties: false,
  };
  const artifactOutputDir = path.join(tempDir, 'contextual-artifacts', 'prepare', 'artifacts');
  mkdirSync(artifactOutputDir, { recursive: true });

  assert.equal(validateAgainstOutputSchema({
    schema,
    output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: path.join(artifactOutputDir, 'packet.md') }] },
    artifactPathErrors: artifactPathBoundaryErrors({ artifacts: [{ path: path.join(artifactOutputDir, 'packet.md') }] }, artifactOutputDir),
  }).ok, true);

  for (const artifactPath of ['/tmp/outside-step.md', path.join(tempDir, 'contextual-artifacts', 'branch_a', 'artifacts', 'packet.md'), path.join(artifactOutputDir, '..', '..', 'branch_b', 'artifacts', 'packet.md'), artifactOutputDir]) {
    const output = { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: artifactPath }] };
    const validation = validateAgainstOutputSchema({
      schema,
      output,
      artifactPathErrors: artifactPathBoundaryErrors(output, artifactOutputDir),
    });
    assert.equal(validation.ok, false, `expected artifact path to be rejected: ${artifactPath}`);
    assert.match(validation.errors, /artifact output directory/);
  }
});

test('output.schema: contextual artifact validation rejects symlink escapes', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: {
        type: 'array',
        items: { $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact' },
      },
    },
    additionalProperties: false,
  };
  const artifactOutputDir = path.join(tempDir, 'symlink-artifacts', 'prepare', 'artifacts');
  const outsideDir = path.join(tempDir, 'symlink-artifacts-outside');
  mkdirSync(artifactOutputDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(outsideDir, path.join(artifactOutputDir, 'escape'), 'dir');

  const validation = validateAgainstOutputSchema({
    schema,
    output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: path.join(artifactOutputDir, 'escape', 'packet.md') }] },
    artifactPathErrors: artifactPathBoundaryErrors({ artifacts: [{ path: path.join(artifactOutputDir, 'escape', 'packet.md') }] }, artifactOutputDir),
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors, /symlinks/);
});


test('output.schema: contextual artifact validation rejects symlinked expected artifact directory', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: {
        type: 'array',
        items: { $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact' },
      },
    },
    additionalProperties: false,
  };
  const stepDir = path.join(tempDir, 'symlink-expected-artifacts', 'prepare');
  const artifactOutputDir = path.join(stepDir, 'artifacts');
  const outsideDir = path.join(tempDir, 'symlink-expected-artifacts-outside');
  mkdirSync(stepDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  symlinkSync(outsideDir, artifactOutputDir, 'dir');

  const validation = validateAgainstOutputSchema({
    schema,
    output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: path.join(artifactOutputDir, 'packet.md') }] },
    artifactPathErrors: artifactPathBoundaryErrors({ artifacts: [{ path: path.join(artifactOutputDir, 'packet.md') }] }, artifactOutputDir),
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors, /not a symlink/);
});

test('output.schema: loose step schemas still reject legacy artifact fields', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { const: 'ready' },
      artifacts: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
    additionalProperties: true,
  };

  const validation = validateAgainstOutputSchema({
    schema,
    output: { outcome: 'ready', artifacts: [{ id: 'packet', content_type: 'text/markdown', path: '/runs/worker_step/artifacts/packet.md', producer_step_id: 'worker_step' }] },
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors, /\/artifacts\/0\/producer_step_id is not allowed/);
});
