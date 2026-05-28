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

test('runner: next returns a single host action request with compiled prompt and output path', () => {
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
  assert.match(response.requests[0].compiledPrompt.prompt, /# Prepare/);
  assert.equal(response.requests[0].outputPath, path.join(runDir, 'outputs', 'prepare.json'));
  assert.equal(existsSync(path.join(runDir, 'baton.json')), true);
});

test('runner: continue applies single output and returns terminal done', () => {
  const runDir = path.join(tempDir, 'single-continue');
  const workflowPath = path.join(tempDir, 'single-continue-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  const first = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next single continue');
  writeJson(first.requests[0].outputPath, workerOutput('prepared'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath], 'continue single');

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared');
});

test('runner: continue fans out parallel branch requests with separate output paths', () => {
  const runDir = path.join(tempDir, 'parallel');
  const workflowPath = path.join(tempDir, 'parallel-workflow.json');
  writeJson(workflowPath, workflowDoc);

  const first = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next prepare');
  writeJson(first.requests[0].outputPath, workerOutput('prepared'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath], 'continue prepare');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.requests.map((request) => request.outputPath), [
    path.join(runDir, 'outputs', 'branch_a.json'),
    path.join(runDir, 'outputs', 'branch_b.json'),
  ]);
  assert.match(response.requests[0].compiledPrompt.prompt, /prepared/);
});

test('runner: continue collects parallel outputs and advances to join request', () => {
  const runDir = path.join(tempDir, 'parallel-join');
  const workflowPath = path.join(tempDir, 'parallel-join-workflow.json');
  writeJson(workflowPath, workflowDoc);

  const first = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next prepare join');
  writeJson(first.requests[0].outputPath, workerOutput('prepared'));
  const branches = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath], 'continue prepare join');
  for (const request of branches.requests) writeJson(request.outputPath, workerOutput(`${request.id} complete`));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath], 'continue branches');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.match(response.requests[0].compiledPrompt.prompt, /branch_a complete/);
  assert.match(response.requests[0].compiledPrompt.prompt, /branch_b complete/);
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
