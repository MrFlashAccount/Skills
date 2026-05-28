import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));

const workflowDoc = {
  workflow: {
    name: 'runner-check',
    version: 1,
    start: 'prepare',
    done: 'done',
    blocked: 'blocked',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { prompt: 'Prepare branch.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch A.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch B.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { state: ['branch_a', 'branch_b'], prompt: 'Join branch output.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
  },
};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runRunner(args) {
  return spawnSync(process.execPath, ['develop/scripts/workflow-runner.mjs', ...args], { cwd: root, encoding: 'utf8' });
}

function expectRunner(args, label) {
  const result = runRunner(args);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner: next returns a single host action request with load command only', () => {
  const runDir = path.join(tempDir, 'single');
  const workflowPath = path.join(tempDir, 'single-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  const response = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next single');

  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.baton.cursor, 'prepare');
  assert.deepEqual(response.requests.map((request) => request.id), ['prepare']);
  assert.equal(response.requests[0].action, 'run_worker');
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  assert.equal(response.requests[0].stepId, 'prepare');
  assert.equal(Object.hasOwn(response.requests[0], 'instructionRef'), false);
  assert.match(response.requests[0].loadInstructionsCommand, /workflow-runner\.mjs instructions --run-dir .* --step-id 'prepare'/);
  assert.equal(Object.hasOwn(response.requests[0], 'outputPath'), false);

  const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
  assert.equal(Object.hasOwn(lastResponse.requests[0], 'instructionRef'), false);
  assert.equal(Object.hasOwn(lastResponse.requests[0], 'outputPath'), false);

  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /# Prepare/);

  assert.equal(existsSync(path.join(runDir, 'baton.json')), true);
});

test('runner: continue applies single output and returns terminal done', () => {
  const runDir = path.join(tempDir, 'single-continue');
  const workflowPath = path.join(tempDir, 'single-continue-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next single continue');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', outputPath], 'continue single');

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared');
});

test('runner: continue fans out parallel branch requests with separate step ids and load commands', () => {
  const runDir = path.join(tempDir, 'parallel');
  const workflowPath = path.join(tempDir, 'parallel-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next prepare');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue prepare');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.requests.map((request) => request.stepId), ['branch_a', 'branch_b']);
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  assert.equal(Object.hasOwn(response.requests[0], 'outputPath'), false);
  assert.equal(Object.hasOwn(response.requests[0], 'instructionRef'), false);
  assert.notEqual(response.requests[0].loadInstructionsCommand, response.requests[1].loadInstructionsCommand);
  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /prepared/);
});

test('runner: continue collects parallel outputs and advances to join request', () => {
  const runDir = path.join(tempDir, 'parallel-join');
  const workflowPath = path.join(tempDir, 'parallel-join-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next prepare join');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branches = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue prepare join');
  const branchOutputs = branches.requests.map((request) => {
    const outputPath = path.join(runDir, `${request.id}-artifact.json`);
    writeJson(outputPath, workerOutput(`${request.id} complete`));
    return `${request.id}=${outputPath}`;
  });
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, ...branchOutputs.flatMap((output) => ['--output', output])], 'continue branches');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'join']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /branch_a complete/);
  assert.match(loaded.stdout, /branch_b complete/);
  const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(baton.cursor, 'join');
});

test('runner: continue reports missing requested output as an error', () => {
  const runDir = path.join(tempDir, 'missing-output');
  const workflowPath = path.join(tempDir, 'missing-output-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next missing');
  const result = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing host output/);
});


test('runner: instructions rejects unknown, unsafe, and missing instructions', () => {
  const runDir = path.join(tempDir, 'instructions-errors');
  const workflowPath = path.join(tempDir, 'instructions-errors-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next instructions errors');

  const unknown = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'nope']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown current workflow step id: nope/);

  const unsafe = runRunner(['instructions', '--run-dir', runDir, '--step-id', '../prepare']);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /invalid workflow step id/);

  rmSync(path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md'), { force: true });
  const missing = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cannot read instructions for workflow step prepare/);
});
