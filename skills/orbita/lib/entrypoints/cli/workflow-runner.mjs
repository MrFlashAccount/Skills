#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { continueRun, loadInstructions, next, writeOutput } from '../api/workflowRunner.mjs';
import { publicErrorMessage } from './public-error.mjs';


function fail(message) {
  console.error(`workflow-runner: ${publicErrorMessage(message)}`);
  process.exit(1);
}

function usage() {
  return 'usage: node skills/orbita/lib/entrypoints/cli/workflow-runner.mjs next --run-id <id> [--workflow <workflow.json>] [--runs-root <dir>] [--diagnostics] [--only-instructions] [--user-prompt <text> | --user-prompt-file <path>] [--lease-token <token> + diagnostics metadata] | continue --run-id <id> [--workflow <workflow.json>] [--runs-root <dir>] [--diagnostics] [--only-instructions] [--lease-token <token> + diagnostics metadata] | instructions --run-id <id> --step-id <id> [--workflow <workflow.json>] [--runs-root <dir>] [--lease-token <token> + diagnostics metadata] | write-output --run-id <id> --step-id <id> [--json <json>] [--workflow <workflow.json>] [--runs-root <dir>] [--lease-token <token> + diagnostics metadata]';
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['next', 'continue', 'instructions', 'write-output'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        'run-id': { type: 'string' },
        'step-id': { type: 'string' },
        workflow: { type: 'string' },
        'runs-root': { type: 'string' },
        diagnostics: { type: 'boolean', default: false },
        'only-instructions': { type: 'boolean', default: false },
        json: { type: 'string' },
        'user-prompt': { type: 'string' },
        'user-prompt-file': { type: 'string' },
        owner: { type: 'string' },
        harness: { type: 'string' },
        'session-id': { type: 'string' },
        'worker-id': { type: 'string' },
        'lease-token': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (!parsed.values['run-id']) fail(usage());
    if (['instructions', 'write-output'].includes(mode) && !parsed.values['step-id']) fail(usage());
    if (!['instructions', 'write-output'].includes(mode) && parsed.values['step-id']) fail(usage());
    if (mode !== 'next' && (parsed.values['user-prompt'] !== undefined || parsed.values['user-prompt-file'] !== undefined)) fail(usage());
    if (mode === 'instructions' && parsed.values.diagnostics) fail(usage());
    if (!['next', 'continue'].includes(mode) && parsed.values['only-instructions']) fail(usage());
    if (mode !== 'write-output' && parsed.values.json !== undefined) fail(usage());
    if (mode === 'write-output' && parsed.values.diagnostics) fail(usage());
    return { mode, values: parsed.values };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

function leaseArgs(values) {
  return {
    owner: values.owner,
    harness: values.harness,
    sessionId: values['session-id'],
    workerId: values['worker-id'],
    leaseToken: values['lease-token'],
  };
}

function writeHostResponse(response, { onlyInstructions }) {
  if (onlyInstructions) {
    process.stdout.write(`${response.orchestratorInstruction}\n`);
    return;
  }
  console.log(JSON.stringify(response, null, 2));
}

try {
  const { mode, values } = parseCliArgs(process.argv.slice(2));
  if (mode === 'instructions') {
    const instructions = await loadInstructions({
      runId: values['run-id'],
      workflowPath: values.workflow,
      runsRoot: values['runs-root'],
      stepId: values['step-id'],
      ...leaseArgs(values),
    });
    process.stdout.write(instructions);
  } else if (mode === 'write-output') {
    const response = await writeOutput({
      runId: values['run-id'],
      workflowPath: values.workflow,
      runsRoot: values['runs-root'],
      stepId: values['step-id'],
      json: values.json ?? await readStdin(),
      ...leaseArgs(values),
    });
    console.log(JSON.stringify(response, null, 2));
  } else {
    const command = mode === 'next' ? next : continueRun;
    const response = await command({
      runId: values['run-id'],
      workflowPath: values.workflow,
      runsRoot: values['runs-root'],
      includeDiagnostics: values.diagnostics,
      userPrompt: values['user-prompt'],
      userPromptFile: values['user-prompt-file'],
      ...leaseArgs(values),
    });
    writeHostResponse(response, { onlyInstructions: values['only-instructions'] });
  }
} catch (error) {
  if (error instanceof WorkflowRuntimeError) fail(error.message);
  fail(error.message);
}
