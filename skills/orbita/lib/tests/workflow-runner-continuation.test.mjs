import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { next as runnerNext } from '../entrypoints/workflow-runner-command.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';
import { publicFailureHistoryDetails } from '../entrypoints/internal/runner/history-projection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
writeFileSync(path.join(tempDir, 'output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { type: 'string' },
  },
  additionalProperties: true,
}, null, 2)}\n`);
const testLeaseToken = `workflow-runner-test-token-${process.pid}`;
const leaseTokensByRunId = new Map();
process.env.WORKFLOW_RUN_TOKEN = testLeaseToken;

const workflowDoc = {
    name: 'runner-check',
    version: 1,
    start: 'prepare',
    done: 'done',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { prompt: 'Prepare branch.' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { prompt: 'Run branch A.' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { prompt: 'Run branch B.' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { prompt: 'Join branch output.' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
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

function withDebugSummaryArg(args, options = {}) {
  if (args[0] !== 'write-output' || args.includes('--debug-summary-file') || options.debugSummary !== true) return args;
  const runId = valueAfter(args, '--run-id');
  const stepId = valueAfter(args, '--step-id');
  if (!runId || !stepId) return args;
  const runsRoot = valueAfter(args, '--runs-root');
  const debugSummaryPath = path.join(resolveRunPaths({ runId, runsRoot }).runDir, stepId, 'debug-summary.md');
  mkdirSync(path.dirname(debugSummaryPath), { recursive: true });
  writeFileSync(debugSummaryPath, options.debugSummaryText ?? `debug summary for ${stepId}\n`);
  return [...args, '--debug-summary-file', debugSummaryPath];
}

function runRunner(args, options = {}) {
  const token = claimRunForRunnerArgs(args);
  const runnerArgs = withDebugSummaryArg(withLeaseTokenArg(args, token), options);
  return spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', ...runnerArgs], { cwd: root, encoding: 'utf8', input: options.input, env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken, ...(options.env ?? {}) } });
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

function currentRequests(runId, workflowPath) {
  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'derive current requests');
  return response.requests ?? [];
}

function currentRequestIds(runId, workflowPath) {
  return currentRequests(runId, workflowPath).map((request) => request.stepId ?? request.id);
}

function parseOutputRef(ref) {
  const separator = ref.indexOf('=');
  if (separator < 0) return { stepId: undefined, filePath: ref };
  return { stepId: ref.slice(0, separator), filePath: ref.slice(separator + 1) };
}

function writeOutputFile({ runId, runDir, workflowPath, stepId, filePath, label = 'write output', options = {} }) {
  const requests = currentRequests(runId, workflowPath);
  const pendingIds = requests.map((request) => request.stepId ?? request.id);
  const targetStepId = stepId ?? pendingIds[0];
  const request = requests.find((item) => (item.stepId ?? item.id) === targetStepId);
  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', targetStepId], { input: readFileSync(filePath, 'utf8'), debugSummary: request?.action === 'run_worker', ...options });
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function recordOrchestratorNote({ runId, workflowPath, note, label = 'record orchestrator note' }) {
  const result = runRunner(['record-orchestrator', '--run-id', runId, '--workflow', workflowPath], { input: JSON.stringify(note) });
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function continueWithOutputs({ runId, runDir, workflowPath, refs, label = 'continue', options = {} }) {
  const normalized = Array.isArray(refs) ? refs : [refs];
  const pendingIds = currentRequestIds(runId, workflowPath);
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
  writeJson(workflowPath, dynamicWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next dynamic single branch setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, { outcome: 'ready', selected_steps: ['branch_a'] });
  const branch = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue dynamic prepare to one branch' });
  assert.deepEqual(branch.requests.map((request) => request.id), ['branch_a']);
  assert.equal(branch.baton.cursor, 'branch_a');

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
  writeJson(workflowPath, staticWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next static single branch setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branch = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue static prepare to one branch' });
  assert.deepEqual(branch.requests.map((request) => request.id), ['branch_a']);
  assert.equal(branch.baton.cursor, 'branch_a');

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

  const result = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow prompt render failed/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
  const failureHistory = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  const failureEntry = failureHistory.slice(historyBefore.length);
  assert.match(failureEntry, /source: workflow-runner-failure/);
  assert.match(failureEntry, /public failure: command=continue/);
  assert.match(failureEntry, /workflow prompt render failed: missing input template 'missing-input-template.md'/);
  assert.doesNotMatch(failureEntry, /source: workflow-runner-continue/);

  const baton = JSON.parse(batonBefore);
  assert.equal(baton.cursor, 'prepare');
  assert.equal(Object.hasOwn(baton.state, 'prepare'), true);
  assert.equal(baton.state.prepare.results[0].summary, 'prepared but should not persist');
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

  const result = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow prompt render failed/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
  const failureHistory = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  const failureEntry = failureHistory.slice(historyBefore.length);
  assert.match(failureEntry, /source: workflow-runner-failure/);
  assert.match(failureEntry, /public failure: command=continue/);
  assert.match(failureEntry, /workflow prompt render failed: missing input template 'missing-join-template.md'/);
  assert.doesNotMatch(failureEntry, /source: workflow-runner-continue/);
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'parallel-output.json')), false);
});

test('runner: continue recovers from post-render durable commit failure without mismatched next state', () => {
  for (const failurePoint of ['pending', 'history', 'baton']) {
    const { runId, runDir } = runCase(`durable-commit-${failurePoint}-failure`);
    const workflowPath = path.join(tempDir, `durable-commit-${failurePoint}-failure-workflow.json`);
    const singleWorkflow = structuredClone(workflowDoc);
    singleWorkflow.steps.prepare.next = 'join';
    singleWorkflow.steps.join.input.prompt = 'Join branch output:\n${{ input.prepare }}';
    writeJson(workflowPath, singleWorkflow);

    expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], `next durable commit ${failurePoint} failure setup`);
    const outputPath = path.join(runDir, 'prepare-result.json');
    writeJson(outputPath, workerOutput(`prepared after durable ${failurePoint} retry`));
    writeOutputFile({ runId, runDir, workflowPath, stepId: 'prepare', filePath: outputPath, label: `write durable ${failurePoint} output` });
    const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
    const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
    const failed = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath], {
      env: { WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER: failurePoint },
    });

    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, new RegExp(`injected durable commit failure after ${failurePoint}`));
    assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
    assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
    assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), true);

    const recovered = runRunner(['instructions', '--run-id', runId, '--step-id', 'join']);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.match(recovered.stdout, new RegExp(`prepared after durable ${failurePoint} retry`));
    assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), false);

    const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
    const nextResponse = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], `derive recovered response ${failurePoint}`);
    assert.equal(baton.cursor, 'join');
    assert.equal(nextResponse.status, 'needs_host_actions');
    assert.deepEqual(nextResponse.requests.map((request) => request.id), ['join']);
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

  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', 'prepare'], { input: readFileSync(outputPath, 'utf8'), debugSummary: true });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow history.*symlink|symlink.*history/);
  assert.equal(readFileSync(outsideSecret, 'utf8'), 'outside secret must not be read or overwritten\n');
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), false);
});

test('runner: history records accepted output debug summary and preserves sparse startup baseline', () => {
  const { runId, runDir } = runCase('accepted-output-debug-history');
  const workflowPath = path.join(tempDir, 'accepted-output-debug-history-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next accepted output debug history');
  const sparseHistory = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(sparseHistory, /source: workflow-runner/);
  assert.match(sparseHistory, /requests: id=prepare action=run_worker/);
  assert.doesNotMatch(sparseHistory, /accepted output summary/);

  const debugSummaryText = `${Array.from({ length: 90 }, (_, index) => `reasoning line ${index + 1}`).join('\n')}\n`;
  const outputPath = path.join(runDir, 'prepare-debug-output.json');
  writeJson(outputPath, {
    outcome: 'ready',
    results: [{ type: 'check', summary: 'debug history smoke passed' }],
  });

  writeOutputFile({ runId, runDir, workflowPath, stepId: 'prepare', filePath: outputPath, label: 'write debug history output', options: { debugSummaryText } });
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /accepted output summary: step=prepare action=run_worker/);
  assert.match(history, /outcome: ready/);
  assert.match(history, /results: count=1 summaries=debug history smoke passed/);
  assert.match(history, /debug-summary body:/);
  assert.match(history, /reasoning line 80/);
  assert.doesNotMatch(history, /reasoning line 81/);
  assert.match(history, /\[truncated: limit 4096 bytes\/80 lines\]/);
});

test('runner: debug summary history reads only a bounded regular-file prefix', () => {
  const { runId, runDir } = runCase('accepted-output-debug-history-large-file');
  const workflowPath = path.join(tempDir, 'accepted-output-debug-history-large-file-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next large debug history');
  const outputPath = path.join(runDir, 'prepare-large-debug-output.json');
  writeJson(outputPath, {
    outcome: 'ready',
  });

  writeOutputFile({
    runId,
    runDir,
    workflowPath,
    stepId: 'prepare',
    filePath: outputPath,
    label: 'write large debug history output',
    options: { debugSummaryText: `${'a'.repeat(4096)}TAIL-MUST-NOT-APPEAR\n` },
  });
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /debug-summary body:/);
  assert.doesNotMatch(history, /TAIL-MUST-NOT-APPEAR/);
  assert.match(history, /\[truncated: limit 4096 bytes\/80 lines\]/);
});

test('runner: write-output rejects non-regular debug summary side-channel before accepting output', () => {
  const { runId, runDir } = runCase('accepted-output-debug-history-fifo');
  const workflowPath = path.join(tempDir, 'accepted-output-debug-history-fifo-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next fifo debug history');
  const debugSummaryPath = path.join(runDir, 'prepare', 'debug-summary.md');
  mkdirSync(path.dirname(debugSummaryPath), { recursive: true });
  makeFifo(debugSummaryPath);
  const outputPath = path.join(runDir, 'prepare-fifo-debug-output.json');
  writeJson(outputPath, {
    outcome: 'ready',
  });

  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', 'prepare', '--debug-summary-file', debugSummaryPath], { input: readFileSync(outputPath, 'utf8') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /debug summary file is required but unavailable \(ENOTREG\)/);
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.doesNotMatch(history, /accepted output summary: step=prepare/);
  assert.doesNotMatch(history, /debug-summary body:/);
});

test('runner: accepted output history redacts copied lease tokens from summaries and debug body', () => {
  const { runId, runDir } = runCase('accepted-output-redacts-lease-token');
  const workflowPath = path.join(tempDir, 'accepted-output-redacts-lease-token-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next accepted output lease redaction');
  const leaseToken = leaseTokensByRunId.get(runId);
  assert.ok(leaseToken, 'test run should have a claimed lease token');
  const outputPath = path.join(runDir, 'prepare-redacted-debug-output.json');
  writeJson(outputPath, {
    outcome: 'ready',
    results: [{ type: 'check', summary: `command includes --lease-token ${leaseToken}` }],
    blocker: { summary: `token ${leaseToken} must not persist` },
  });

  writeOutputFile({
    runId,
    runDir,
    workflowPath,
    stepId: 'prepare',
    filePath: outputPath,
    label: 'write redacted debug history output',
    options: { debugSummaryText: `Copied command: workflow-runner write-output --lease-token '${leaseToken}'\nRaw token: ${leaseToken}\n` },
  });
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.doesNotMatch(history, new RegExp(leaseToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(history, /\[redacted-lease-token\]/);
});

test('runner: disabled debug history suppresses rich side-channel body but keeps fallback summary', () => {
  const { runId, runDir } = runCase('debug-history-disabled');
  const workflowPath = path.join(tempDir, 'debug-history-disabled-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next disabled debug history');
  const outputPath = path.join(runDir, 'prepare-disabled-debug-output.json');
  writeJson(outputPath, {
    outcome: 'ready',
  });

  writeOutputFile({
    runId,
    runDir,
    workflowPath,
    stepId: 'prepare',
    filePath: outputPath,
    label: 'write disabled debug history output',
    options: { env: { WORKFLOW_RUNNER_DEBUG_HISTORY: '0' }, debugSummaryText: 'suppressed worker reasoning\n' },
  });

  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /accepted output summary: step=prepare action=run_worker/);
  assert.match(history, /debug-summary: rich body disabled/);
  assert.doesNotMatch(history, /suppressed worker reasoning/);
});

test('runner: orchestrator debug note appends bounded host rationale and deduplicates retries', () => {
  const { runId, runDir } = runCase('orchestrator-debug-history');
  const workflowPath = path.join(tempDir, 'orchestrator-debug-history-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'review';
  singleWorkflow.steps.review = {
    name: 'Review',
    kind: 'worker',
    input: { prompt: 'Review.' },
    output: singleWorkflow.steps.prepare.output,
    next: 'done',
  };
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next orchestrator debug history');
  const leaseToken = leaseTokensByRunId.get(runId);
  const note = {
    summary: 'spawned prepare worker and accepted its output',
    reasoning: 'The current runner request was run_worker for prepare, so host delegated only that step before continue.',
    commands: [
      `workflow-runner instructions --lease-token ${leaseToken}`,
      'workflow-runner bind-agent --agent-id worker-1',
    ],
    validation: 'worker reported accepted write-output',
    risks: 'none known',
  };

  const prepareOutputPath = path.join(runDir, 'prepare-orchestrator-debug-output.json');
  writeJson(prepareOutputPath, workerOutput('prepared'));
  writeOutputFile({
    runId,
    runDir,
    workflowPath,
    stepId: 'prepare',
    filePath: prepareOutputPath,
    label: 'write prepare before orchestrator debug',
  });

  assert.deepEqual(recordOrchestratorNote({ runId, workflowPath, note }), {
    ok: true,
    runId,
    recorded: true,
  });
  assert.deepEqual(recordOrchestratorNote({ runId, workflowPath, note, label: 'dedupe orchestrator note' }), {
    ok: true,
    runId,
    recorded: false,
  });

  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /source: workflow-runner-orchestrator/);
  assert.match(history, /orchestrator debug summary:/);
  assert.match(history, /spawned prepare worker and accepted its output/);
  assert.match(history, /workflow-runner bind-agent --agent-id worker-1/);
  assert.doesNotMatch(history, new RegExp(leaseToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(history, /\[redacted-lease-token\]/);
  assert.equal((history.match(/orchestrator debug summary:/g) ?? []).length, 1);

  const continued = expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], 'continue to next orchestrator debug cycle');
  assert.equal(continued.status, 'needs_host_actions');
  assert.deepEqual(continued.requests.map((request) => request.stepId), ['review']);
  const reviewOutputPath = path.join(runDir, 'review-orchestrator-debug-output.json');
  writeJson(reviewOutputPath, workerOutput('reviewed'));
  writeOutputFile({
    runId,
    runDir,
    workflowPath,
    stepId: 'review',
    filePath: reviewOutputPath,
    label: 'write review before repeated orchestrator debug',
  });
  assert.deepEqual(recordOrchestratorNote({ runId, workflowPath, note, label: 'record repeated note in next host cycle' }), {
    ok: true,
    runId,
    recorded: true,
  });
  assert.deepEqual(recordOrchestratorNote({ runId, workflowPath, note, label: 'dedupe repeated note in next host cycle' }), {
    ok: true,
    runId,
    recorded: false,
  });
  const nextCycleHistory = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.equal((nextCycleHistory.match(/orchestrator debug summary:/g) ?? []).length, 2);
});

test('runner: public continue failure history is safely attributable and deduplicated', () => {
  const { runId, runDir } = runCase('public-failure-history');
  const workflowPath = path.join(tempDir, 'public-failure-history-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next public failure history');
  const failed = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /missing accepted host output/);

  const failedAgain = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);
  assert.notEqual(failedAgain.status, 0);
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /source: workflow-runner-failure/);
  assert.match(history, /public failure: command=continue/);
  assert.match(history, /missing accepted host output for workflow step prepare/);
  assert.equal((history.match(/public failure: command=continue/g) ?? []).length, 1);
});

test('runner: public failure history redacts exact lease token outside option syntax', () => {
  const { runId, runDir } = runCase('public-failure-history-redacts-token-step-id');
  const workflowPath = path.join(tempDir, 'public-failure-history-redacts-token-step-id-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next public failure token redaction');
  const leaseToken = leaseTokensByRunId.get(runId);
  assert.ok(leaseToken, 'test run should have a claimed lease token');
  const failed = runRunner(['instructions', '--run-id', runId, '--workflow', workflowPath, '--step-id', leaseToken]);
  assert.notEqual(failed.status, 0);

  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /source: workflow-runner-failure/);
  assert.match(history, /public failure: command=instructions/);
  assert.doesNotMatch(history, new RegExp(leaseToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(history, /\[redacted-lease-token\]/);
});

test('runner: public failure history details bound long public errors with a truncation marker', () => {
  const details = publicFailureHistoryDetails({
    command: 'continue',
    error: Array.from({ length: 50 }, (_, index) => `public error line ${index + 1}`).join('\n'),
  }).join('\n');

  assert.match(details, /public error line 40/);
  assert.doesNotMatch(details, /public error line 41/);
  assert.match(details, /\[truncated: limit 2048 bytes\/40 lines\]/);
});

test('runner: continue history includes transition and terminal context', () => {
  const { runId, runDir } = runCase('terminal-transition-history');
  const workflowPath = path.join(tempDir, 'terminal-transition-history-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next terminal transition history');
  const outputPath = path.join(runDir, 'prepare-terminal-output.json');
  writeJson(outputPath, workerOutput('terminal transition complete'));
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: outputPath, label: 'continue terminal transition' });

  assert.equal(response.status, 'done');
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.match(history, /transition: cursor=prepare status=running -> cursor=done status=done/);
  assert.match(history, /terminal: status=done cursor=done/);
  assert.match(history, /next requests: none/);
});
