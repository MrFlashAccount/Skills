#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WorkflowInterpreterError } from '../lib/workflow/errors.mjs';
import { continueRun, next } from '../lib/workflow/runner/index.mjs';

function fail(message) {
  console.error(`workflow-runner: ${message}`);
  process.exit(1);
}

function usage() {
  return 'usage: node scripts/workflow-runner.mjs next --run-dir <dir> [--workflow <workflow.json>] [--diagnostics] | continue --run-dir <dir> [--workflow <workflow.json>] [--diagnostics]';
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['next', 'continue'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        'run-dir': { type: 'string' },
        workflow: { type: 'string' },
        diagnostics: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    if (!parsed.values['run-dir']) fail(usage());
    return { mode, values: parsed.values };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

try {
  const { mode, values } = parseCliArgs(process.argv.slice(2));
  const command = mode === 'next' ? next : continueRun;
  const response = await command({
    runDir: values['run-dir'],
    workflowPath: values.workflow,
    includeDiagnostics: values.diagnostics,
  });
  console.log(JSON.stringify(response, null, 2));
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  fail(error.message);
}
