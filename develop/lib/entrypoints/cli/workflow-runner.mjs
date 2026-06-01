#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { continueRun, loadInstructions, next } from '../api/workflowRunner.mjs';

function fail(message) {
  console.error(`workflow-runner: ${message}`);
  process.exit(1);
}

function usage() {
  return 'usage: node develop/lib/entrypoints/cli/workflow-runner.mjs next --run-id <id> [--workflow <workflow.json>] [--diagnostics] [--user-prompt <text> | --user-prompt-file <path>] | continue --run-id <id> --output <worker-output.json> [--output <step-id=worker-output.json> ...] [--workflow <workflow.json>] [--diagnostics] | instructions --run-id <id> --step-id <id> [--workflow <workflow.json>]';
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['next', 'continue', 'instructions'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        'run-id': { type: 'string' },
        'step-id': { type: 'string' },
        workflow: { type: 'string' },
        diagnostics: { type: 'boolean', default: false },
        output: { type: 'string', multiple: true },
        'user-prompt': { type: 'string' },
        'user-prompt-file': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (!parsed.values['run-id']) fail(usage());
    if (mode === 'instructions' && !parsed.values['step-id']) fail(usage());
    if (mode !== 'instructions' && parsed.values['step-id']) fail(usage());
    if (mode !== 'continue' && parsed.values.output?.length) fail(usage());
    if (mode !== 'next' && (parsed.values['user-prompt'] !== undefined || parsed.values['user-prompt-file'] !== undefined)) fail(usage());
    if (mode === 'instructions' && (parsed.values.diagnostics || parsed.values.output?.length)) fail(usage());
    return { mode, values: parsed.values };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

try {
  const { mode, values } = parseCliArgs(process.argv.slice(2));
  if (mode === 'instructions') {
    const instructions = await loadInstructions({
      runId: values['run-id'],
      workflowPath: values.workflow,
      stepId: values['step-id'],
    });
    process.stdout.write(instructions);
  } else {
    const command = mode === 'next' ? next : continueRun;
    const response = await command({
      runId: values['run-id'],
      workflowPath: values.workflow,
      includeDiagnostics: values.diagnostics,
      output: values.output,
      userPrompt: values['user-prompt'],
      userPromptFile: values['user-prompt-file'],
    });
    console.log(JSON.stringify(response, null, 2));
  }
} catch (error) {
  if (error instanceof WorkflowRuntimeError) fail(error.message);
  fail(error.message);
}
