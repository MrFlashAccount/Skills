import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
const testLeaseToken = `workflow-runner-test-token-${process.pid}`;
const leaseTokensByRunId = new Map();
process.env.WORKFLOW_RUN_TOKEN = testLeaseToken;

const workflowDoc = {
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
        output: { template: 'output.md' },
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch A.' },
        output: { template: 'output.md' },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch B.' },
        output: { template: 'output.md' },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { state: ['branch_a', 'branch_b'], prompt: 'Join branch output.' },
        output: { template: 'output.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function claimRunForTest(paths) {
  const knownToken = leaseTokensByRunId.get(paths.runId);
  if (knownToken) {
    process.env.WORKFLOW_RUN_TOKEN = knownToken;
    return knownToken;
  }
  const createArgs = ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', paths.runId, '--workflow', paths.workflowPath];
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8', env: process.env });
  if (created.status === 0) {
    const token = JSON.parse(created.stdout).leaseToken;
    leaseTokensByRunId.set(paths.runId, token);
    process.env.WORKFLOW_RUN_TOKEN = token;
    return token;
  }
  const token = knownToken ?? testLeaseToken;
  const claimed = spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'claim', '--run-id', paths.runId, '--lease-token', token], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: token } });
  assert.equal(claimed.status, 0, `claim ${paths.runId} failed\ncreate stderr:\n${created.stderr}\nclaim stderr:\n${claimed.stderr}`);
  leaseTokensByRunId.set(paths.runId, token);
  process.env.WORKFLOW_RUN_TOKEN = token;
  return token;
}

function runCase(label, workflowPath) {
  const runId = `workflow-runner-test-${process.pid}-${label}`;
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  if (workflowPath !== undefined) claimRunForTest(paths);
  return { runId, runDir: paths.runDir };
}

function runCaseNamed(name, label, workflowPath) {
  const runId = `workflow-runner-test-${process.pid}-${label}`;
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  if (workflowPath !== undefined) claimRunForTest(paths);
  return { [`${name}RunId`]: runId, [`${name}RunDir`]: paths.runDir };
}


function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function claimRunForRunnerArgs(args) {
  const runId = valueAfter(args, '--run-id');
  if (!runId) return undefined;
  const workflowPath = valueAfter(args, '--workflow');
  const knownToken = leaseTokensByRunId.get(runId);
  if (knownToken) return knownToken;
  const createArgs = ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', runId];
  if (workflowPath !== undefined) createArgs.push('--workflow', workflowPath);
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8', env: process.env });
  if (created.status === 0) {
    const token = JSON.parse(created.stdout).leaseToken;
    leaseTokensByRunId.set(runId, token);
    return token;
  }
  const token = knownToken ?? testLeaseToken;
  const claimArgs = ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'claim', '--run-id', runId, '--lease-token', token];
  if (workflowPath !== undefined) claimArgs.push('--workflow', workflowPath);
  const claimed = spawnSync(process.execPath, claimArgs, { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: token } });
  assert.equal(claimed.status, 0, `claim ${runId} failed\ncreate stderr:\n${created.stderr}\nclaim stderr:\n${claimed.stderr}`);
  return token;
}

function withLeaseTokenArg(args, token) {
  if (args.includes('--lease-token') || !token) return args;
  const [mode, ...rest] = args;
  return [mode, `--lease-token=${token}`, ...rest];
}

function runRunner(args, options = {}) {
  const token = claimRunForRunnerArgs(args);
  return spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], { cwd: root, encoding: 'utf8', input: options.input, env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken, ...(options.env ?? {}) } });
}

async function runRunnerAsync(args) {
  const token = claimRunForRunnerArgs(args);
  const child = spawn(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const [status] = await once(child, 'exit');
  return { status, stdout, stderr };
}

async function waitForPath(filePath) {
  const startedAt = Date.now();
  while (!existsSync(filePath)) {
    if (Date.now() - startedAt > 2000) throw new Error(`timed out waiting for ${filePath}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function makeFifo(filePath) {
  const result = spawnSync('mkfifo', [filePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, `mkfifo ${filePath} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function expectRunner(args, label) {
  const result = runRunner(args);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function currentRequestIds(runDir) {
  const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
  return (lastResponse.requests ?? []).map((request) => request.stepId ?? request.id);
}

function parseOutputRef(ref) {
  const separator = ref.indexOf('=');
  if (separator < 0) return { stepId: undefined, filePath: ref };
  return { stepId: ref.slice(0, separator), filePath: ref.slice(separator + 1) };
}

function writeOutputFile({ runId, runDir, workflowPath, stepId, filePath, label = 'write output', options = {} }) {
  const targetStepId = stepId ?? currentRequestIds(runDir)[0];
  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', targetStepId], { input: readFileSync(filePath, 'utf8'), ...options });
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function continueWithOutputs({ runId, runDir, workflowPath, refs, label = 'continue', options = {} }) {
  const normalized = Array.isArray(refs) ? refs : [refs];
  const pendingIds = currentRequestIds(runDir);
  for (const ref of normalized) {
    const { stepId, filePath } = parseOutputRef(ref);
    const targetStepId = stepId ?? (pendingIds.length === 1 ? pendingIds[0] : undefined);
    assert.ok(targetStepId, `output for ${label} must name a step when multiple requests are pending`);
    writeOutputFile({ runId, runDir, workflowPath, stepId: targetStepId, filePath, label: `${label} write ${targetStepId}` });
  }
  return expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], label, options);
}

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner: dynamic parallel with one branch still applies branch output as parallel envelope', () => {
  const { runId, runDir } = runCase('dynamic-single-branch-parallel');
  const workflowPath = path.join(tempDir, 'dynamic-single-branch-parallel-workflow.json');
  const schemaPath = path.join(tempDir, 'dynamic-single-branch-output.schema.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'selected_steps'],
    properties: {
      outcome: { enum: ['ready'] },
      selected_steps: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['branch_a'] } },
      results: { type: 'array' },
      artifacts: { type: 'array' },
    },
    additionalProperties: false,
  });
  const dynamicWorkflow = structuredClone(workflowDoc);
  dynamicWorkflow.steps.prepare.output.schema = path.basename(schemaPath);
  dynamicWorkflow.steps.prepare.next = '${{ output.selected_steps }}';
  delete dynamicWorkflow.steps.branch_b;
  dynamicWorkflow.steps.join.input.state = ['branch_a'];
  writeJson(workflowPath, dynamicWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next dynamic single branch setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, { outcome: 'ready', selected_steps: ['branch_a'] });
  const branch = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue dynamic prepare to one branch' });
  assert.deepEqual(branch.requests.map((request) => request.id), ['branch_a']);
  assert.equal(branch.baton.cursor, 'prepare');

  const branchOutput = path.join(runDir, 'branch-a-output.json');
  writeJson(branchOutput, workerOutput('single branch complete'));
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: `branch_a=${branchOutput}`, label: 'continue dynamic single branch to join' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.baton.state.branch_a.results[0].summary, 'single branch complete');
  assert.equal(Object.hasOwn(response.baton.state, 'attempts'), false);
});

test('runner: static parallel with one branch still applies branch output as parallel envelope', () => {
  const { runId, runDir } = runCase('static-single-branch-parallel');
  const workflowPath = path.join(tempDir, 'static-single-branch-parallel-workflow.json');
  const staticWorkflow = structuredClone(workflowDoc);
  staticWorkflow.steps.prepare.next = ['branch_a'];
  delete staticWorkflow.steps.branch_b;
  staticWorkflow.steps.join.input.state = ['branch_a'];
  writeJson(workflowPath, staticWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next static single branch setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branch = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue static prepare to one branch' });
  assert.deepEqual(branch.requests.map((request) => request.id), ['branch_a']);
  assert.equal(branch.baton.cursor, 'prepare');

  const branchOutput = path.join(runDir, 'branch-a-output.json');
  writeJson(branchOutput, workerOutput('static single branch complete'));
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: `branch_a=${branchOutput}`, label: 'continue static single branch to join' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.baton.state.branch_a.results[0].summary, 'static single branch complete');
  assert.equal(Object.hasOwn(response.baton.state, 'attempts'), false);
});

test('runner: continue reports missing requested output as an error', () => {
  const { runId, runDir } = runCase('missing-output');
  const workflowPath = path.join(tempDir, 'missing-output-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next missing');
  const result = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing accepted host output/);
});

test('runner: continue does not persist applied output when next render fails', () => {
  const { runId, runDir } = runCase('render-failure-no-advance');
  const workflowPath = path.join(tempDir, 'render-failure-no-advance-workflow.json');
  const renderFailureWorkflow = structuredClone(workflowDoc);
  renderFailureWorkflow.steps.prepare.next = 'bad_render';
  renderFailureWorkflow.steps.bad_render = {
    name: 'Bad Render',
    kind: 'worker',
    input: {
      state: ['prepare'],
      template: 'missing-input-template.md',
      prompt: 'This step should fail prompt rendering.',
    },
    output: { template: 'output.md' },
    next: 'done',
  };
  writeJson(workflowPath, renderFailureWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next render failure setup');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared but should not persist'));
  writeOutputFile({ runId, runDir, workflowPath, stepId: 'prepare', filePath: outputPath, label: 'write render failure output' });
  const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');

  const result = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow prompt render failed/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
  assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);

  const baton = JSON.parse(batonBefore);
  assert.equal(baton.cursor, 'prepare');
  assert.equal(Object.hasOwn(baton.state, 'prepare'), false);
  assert.equal(baton.state.outputs.prepare.results[0].summary, 'prepared but should not persist');
});

test('runner: parallel continue does not create durable envelope when next render fails', () => {
  const { runId, runDir } = runCase('parallel-render-failure-no-envelope');
  const workflowPath = path.join(tempDir, 'parallel-render-failure-no-envelope-workflow.json');
  const renderFailureWorkflow = structuredClone(workflowDoc);
  renderFailureWorkflow.steps.join.input.template = 'missing-join-template.md';
  writeJson(workflowPath, renderFailureWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next parallel render failure setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue prepare to branches' });
  const branchA = path.join(runDir, 'branch-a-output.json');
  const branchB = path.join(runDir, 'branch-b-output.json');
  writeJson(branchA, workerOutput('branch a complete'));
  writeJson(branchB, workerOutput('branch b complete'));
  writeOutputFile({ runId, runDir, workflowPath, stepId: 'branch_a', filePath: branchA, label: 'write branch a render failure output' });
  writeOutputFile({ runId, runDir, workflowPath, stepId: 'branch_b', filePath: branchB, label: 'write branch b render failure output' });
  const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');

  const result = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow prompt render failed/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
  assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'parallel-output.json')), false);
});

test('runner: continue recovers from post-render durable commit failure without mismatched next state', () => {
  for (const failurePoint of ['pending', 'instructions', 'history', 'baton', 'last-response']) {
    const { runId, runDir } = runCase(`durable-commit-${failurePoint}-failure`);
    const workflowPath = path.join(tempDir, `durable-commit-${failurePoint}-failure-workflow.json`);
    const singleWorkflow = structuredClone(workflowDoc);
    singleWorkflow.steps.prepare.next = 'join';
    singleWorkflow.steps.join.input.state = ['prepare'];
    writeJson(workflowPath, singleWorkflow);

    expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], `next durable commit ${failurePoint} failure setup`);
    const outputPath = path.join(runDir, 'prepare-result.json');
    writeJson(outputPath, workerOutput(`prepared after durable ${failurePoint} retry`));
    writeOutputFile({ runId, runDir, workflowPath, stepId: 'prepare', filePath: outputPath, label: `write durable ${failurePoint} output` });
    const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
    const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
    const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');
    const joinInstructionPath = path.join(runDir, '.workflow-runner', 'instructions', 'join.md');
    const staleJoinInstructions = 'stale join instructions must survive failed commit\n';
    assert.equal(existsSync(joinInstructionPath), false);
    writeFileSync(joinInstructionPath, staleJoinInstructions);
    const failed = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath], {
      env: { WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER: failurePoint },
    });

    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, new RegExp(`injected durable commit failure after ${failurePoint}`));
    assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
    assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
    assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);
    assert.equal(readFileSync(joinInstructionPath, 'utf8'), staleJoinInstructions);
    assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), true);

    const recovered = runRunner(['instructions', '--run-id', runId, '--step-id', 'join']);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.match(recovered.stdout, new RegExp(`prepared after durable ${failurePoint} retry`));
    assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), false);

    const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
    const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
    assert.equal(baton.cursor, 'join');
    assert.equal(lastResponse.status, 'needs_host_actions');
    assert.deepEqual(lastResponse.requests.map((request) => request.id), ['join']);
    assert.equal(baton.state.prepare.results[0].summary, `prepared after durable ${failurePoint} retry`);
    assert.match(readFileSync(path.join(runDir, 'history.md'), 'utf8'), /output: accepted:prepare/);
  }
});

test('runner: durable commit recovery rejects symlinked history without reading outside target', () => {
  const { runId, runDir } = runCase('durable-commit-history-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-history-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next durable history symlink escape setup');
  const outsideSecret = path.join(tempDir, 'durable-commit-history-outside-secret.txt');
  writeFileSync(outsideSecret, 'outside secret must not be read or overwritten\n');
  rmSync(path.join(runDir, 'history.md'), { force: true });
  symlinkSync(outsideSecret, path.join(runDir, 'history.md'), 'file');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared'));

  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', 'prepare'], { input: readFileSync(outputPath, 'utf8') });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow history.*symlink|symlink.*history/);
  assert.equal(readFileSync(outsideSecret, 'utf8'), 'outside secret must not be read or overwritten\n');
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), false);
});

test('runner: durable commit recovery rejects instruction paths outside instructions dir', () => {
  const { runId, runDir } = runCase('durable-commit-instruction-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instruction-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next durable instruction escape setup');
  const victimPath = path.join(tempDir, 'durable-commit-victim.txt');
  rmSync(victimPath, { force: true });
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: victimPath, content: 'pwned\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instruction path escapes instructions dir/);
  assert.equal(existsSync(victimPath), false);
});

test('runner: durable commit recovery rejects symlinked instruction paths outside instructions dir', () => {
  const { runId, runDir } = runCase('durable-commit-instruction-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instruction-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next durable instruction symlink escape setup');
  const outsideDir = path.join(tempDir, 'durable-commit-symlink-outside');
  mkdirSync(outsideDir, { recursive: true });
  const linkPath = path.join(runDir, '.workflow-runner', 'instructions', 'link');
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(outsideDir, linkPath, 'dir');
  const victimPath = path.join(outsideDir, 'pwned.md');
  rmSync(victimPath, { force: true });
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: path.join(linkPath, 'pwned.md'), content: 'pwned\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instruction path escapes instructions dir/);
  assert.equal(existsSync(victimPath), false);
});



