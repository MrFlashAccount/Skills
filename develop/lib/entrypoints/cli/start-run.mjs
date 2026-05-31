#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ensureRunFiles, resolveRunPaths } from '../../persistence/run-state/paths.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../../..');
const defaultWorkflowPath = join(repositoryRoot, 'workflows/dev-harness/workflow.json');

function fail(message) {
  console.error(`start-run: ${message}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        'run-dir': { type: 'string' },
        workflow: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error.message}\nusage: node develop/lib/bin/start-run.mjs --run-dir <dir> [--workflow <workflow.json>]`);
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

const values = parseCliArgs(process.argv.slice(2));
const runDir = requireString(values['run-dir'], '--run-dir');
const workflowPath = resolve(values.workflow ?? defaultWorkflowPath);
const paths = resolveRunPaths({ runDir, workflowPath });

const { resumed } = await ensureRunFiles(paths);
const response = inspectWorkflow(paths.workflowPath, paths.batonPath);

console.log(JSON.stringify({
  ok: true,
  runDir: paths.runDir,
  baton: paths.batonPath,
  history: paths.historyPath,
  initialized: !resumed,
  resumed,
  response,
}, null, 2));
