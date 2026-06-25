#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createManagedDirectory } from '../../persistence/run-state/atomic-file.mjs';
import { publicErrorMessage } from './public-error.mjs';
import { assertFreshTokenAuthority, buildTokenLease } from '../../persistence/run-state/lease-authority.mjs';
import { ensureRunFiles, pathExists, resolveRunPaths } from '../../persistence/run-state/paths.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot, upsertRunIndexEntry } from '../../persistence/run-state/run-index.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../../../../..');
const defaultWorkflowPath = join(repositoryRoot, 'workflows/dev-harness/workflow.json');

function fail(message) {
  console.error(`start-run: ${publicErrorMessage(message)}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        'run-id': { type: 'string' },
        workflow: { type: 'string' },
        'lease-token': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error.message}\nusage: node ./lib/entrypoints/cli/start-run.mjs --run-id <id> [--workflow <workflow.json>] [--lease-token <token>]`);
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} is required`);
  return value;
}

function inspectWorkflow(workflowPath, batonPath) {
  const result = spawnSync(process.execPath, [join(scriptDir, 'workflow-interpreter.mjs'), 'inspect', workflowPath, batonPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`cannot run workflow interpreter: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`workflow interpreter returned invalid JSON: ${error.message}`);
  }
}

async function resolveIndexedRunPaths({ runId, workflowPath }) {
  const paths = resolveRunPaths({ runId });
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const indexedWorkflowPath = index.runs[runId]?.workflow?.path;
  if (typeof indexedWorkflowPath !== 'string' || indexedWorkflowPath.length === 0) return resolveRunPaths({ runId, workflowPath: workflowPath ?? defaultWorkflowPath });
  if (workflowPath && resolve(indexedWorkflowPath) !== resolve(workflowPath)) fail(`workflow run is already bound to a different workflow: ${runId}`);
  return resolveRunPaths({ runId, workflowPath: indexedWorkflowPath });
}

async function assertOrCreateTokenAuthority(paths, token) {
  if (!token) fail('workflow run token is required');
  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const existing = index.runs[paths.runId];
  if (existing) {
    try { assertFreshTokenAuthority(existing.workerLease, token, { runId: paths.runId }); }
    catch (error) { fail(error.message); }
    return;
  }

  if (await pathExists(paths.batonPath)) {
    fail(`legacy unindexed run state cannot be resumed without an existing token lease: ${paths.runId}`);
  }

  await createRunIndexEntry(paths, {
    status: 'running',
    workflowPath: paths.workflowPath,
    workerLease: buildTokenLease({ token }),
  });
}

const values = parseCliArgs(process.argv.slice(2));
const runId = requireString(values['run-id'], '--run-id');
const workflowPath = values.workflow === undefined ? undefined : resolve(values.workflow);
const paths = await resolveIndexedRunPaths({ runId, workflowPath });
const leaseToken = values['lease-token'];

await assertOrCreateTokenAuthority(paths, leaseToken);
const { resumed } = await ensureRunFiles(paths);
await upsertRunIndexEntry(paths, { status: 'running', workflowPath: paths.workflowPath });
const response = inspectWorkflow(paths.workflowPath, paths.batonPath);

console.log(JSON.stringify({
  ok: true,
  runId: paths.runId,
  initialized: !resumed,
  resumed,
  response,
}, null, 2));
