import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inspectWorkflow } from '../use-cases/index.mjs';
import { WorkflowFileAdapter, RunStateFileAdapter } from '../persistence/index.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../../..');
const defaultWorkflowPath = join(repositoryRoot, 'workflows/dev-harness/workflow.json');
const workflowFiles = new WorkflowFileAdapter();
const runStateFiles = new RunStateFileAdapter();

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

export async function runCli(argv = process.argv.slice(2)) {
  const values = parseCliArgs(argv);
  const runDir = requireString(values['run-dir'], '--run-dir');
  const workflowPath = resolve(values.workflow ?? defaultWorkflowPath);
  const runState = await runStateFiles.prepareStartedRun({ runDir, workflowPath });
  const response = inspectWorkflow({
    workflow: workflowFiles.readWorkflow(runState.workflowPath),
    baton: runState.baton,
  });

  console.log(JSON.stringify({
    ok: true,
    runDir: runState.runDir,
    baton: runState.batonPath,
    history: runState.historyPath,
    initialized: !runState.resumed,
    resumed: runState.resumed,
    response,
  }, null, 2));
}
