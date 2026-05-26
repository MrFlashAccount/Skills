#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { validateWorkflowInterpreterCliArgs } from '../lib/workflow/cli-args-validation.mjs';
import { WorkflowInterpreterError } from '../lib/workflow/errors.mjs';
import { applyWorkflowOutput, inspectWorkflow } from '../lib/workflow/interpreter.mjs';

function fail(message) {
  console.error(`workflow-interpreter: ${message}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    return parseArgs({ args: ['--', ...argv], allowPositionals: true }).positionals;
  } catch (error) {
    fail(error.message);
  }
}

function emit(response) {
  console.log(JSON.stringify(response, null, 2));
}

function usageForArgs(args) {
  const [mode] = args;
  if (mode === 'inspect' || mode === 'directive') return 'usage: node scripts/workflow-interpreter.mjs inspect <workflow.json> <baton.json>';
  if (mode === 'apply') return 'usage: node scripts/workflow-interpreter.mjs apply <workflow.json> <baton.json> <worker-output.json>';
  return 'usage: node scripts/workflow-interpreter.mjs inspect <workflow.json> <baton.json> | apply <workflow.json> <baton.json> <worker-output.json>';
}

function assertCliArgs(args) {
  if (!validateWorkflowInterpreterCliArgs(args)) fail(usageForArgs(args));
}

try {
  const args = parseCliArgs(process.argv.slice(2));
  assertCliArgs(args);

  const [mode, workflowPath, batonPath, outputPath] = args;

  if (mode === 'inspect' || mode === 'directive') {
    emit(inspectWorkflow(workflowPath, batonPath));
  } else if (mode === 'apply') {
    emit(applyWorkflowOutput(workflowPath, batonPath, outputPath));
  } else {
    emit(applyWorkflowOutput(mode, workflowPath, batonPath));
  }
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  throw error;
}
