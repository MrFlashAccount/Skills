import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

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
        next: { by: 'outcome', map: { ready: 'done', blocked: 'blocked' } },
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

function runApply(label, batonDoc, workerOutput, expectSuccess = true, doc = workflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = writeJson(`${prefix}-workflow.json`, doc);
  const before = readFileSync(batonPath, 'utf8');
  const response = expectCliResult(label, runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]), expectSuccess);
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

test('output.schema: valid structured output passes and is stored by step id', () => {
  const doc = workflowWithSchema('valid-structured-output', structuredSchema);

  const response = runApply('output-schema-valid-stored', baton(), {
    outcome: 'ready',
    artifacts: [{ type: 'packet', summary: 'structured' }],
    payload: { ok: true },
  }, true, doc);

  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.outputs.worker_step.payload, { ok: true });
  assert.equal(response.baton.state.artifacts.at(-1).summary, 'structured');
});

test('output.schema: invalid output retries with validation feedback then succeeds', () => {
  const doc = workflowWithSchema('retry-structured-output', structuredSchema);

  const retry = runApply('output-schema-invalid-retry', baton(), { outcome: 'ready', payload: { ok: false } }, true, doc);
  assert.equal(retry.baton.cursor, 'worker_step');
  assert.equal(retry.directive.action, 'run_worker');
  assert.equal(retry.baton.state.attempts['worker_step:output.schema'], 1);
  assert.match(retry.directive.step.input.prompt, /Previous output failed output\.schema validation/);
  assert.match(retry.directive.step.input.prompt, /must be equal to constant/);

  const response = runApply('output-schema-retry-success', retry.baton, { outcome: 'ready', payload: { ok: true } }, true, doc);
  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.outputs.worker_step.payload, { ok: true });
});

test('output.schema: invalid JSON retries as validation failure', () => {
  const doc = workflowWithSchema('invalid-json-output', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  });
  const prefix = safeName('output-schema-invalid-json');
  const batonPath = writeJson(`${prefix}-baton.json`, baton());
  const outputPath = path.join(tempDir, `${prefix}-output.json`);
  writeFileSync(outputPath, '{ not json');
  const wfPath = writeJson(`${prefix}-workflow.json`, doc);

  const response = expectCliResult('output-schema-invalid-json', runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]), true);
  assert.equal(response.baton.cursor, 'worker_step');
  assert.match(response.directive.step.input.prompt, /worker output is not valid JSON/);
});

test('output.schema: invalid output exhausts retry limit deterministically', () => {
  const doc = workflowWithSchema('exhaust-structured-output', structuredSchema);
  const retryOne = runApply('output-schema-exhaust-1', baton(), { outcome: 'ready', payload: 'bad' }, true, doc);
  const retryTwo = runApply('output-schema-exhaust-2', retryOne.baton, { outcome: 'ready', payload: 'bad' }, true, doc);

  const result = runApply('output-schema-exhaust-3', retryTwo.baton, { outcome: 'ready', payload: 'bad' }, false, doc);
  assert.match(result.stderr, /output schema validation failed for step 'worker_step' after 3 attempts/);
});

test('output.schema: absent schema preserves previous envelope behavior without storing outputs', () => {
  const response = runApply('output-schema-absent-unchanged', baton(), {
    outcome: 'ready',
    results: [{ type: 'plain', summary: 'generic worker-output envelope' }],
  });

  assert.equal(response.baton.cursor, 'done');
  assert.equal(Object.hasOwn(response.baton.state, 'outputs'), false);
  assert.equal(response.baton.state.results.at(-1).summary, 'generic worker-output envelope');
});
