#!/usr/bin/env node
import { parseArgs } from 'node:util';
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

try {
  const args = parseCliArgs(process.argv.slice(2));
  const [mode, workflowPath, batonPath, outputPath] = args;

  if (mode === 'inspect' || mode === 'directive') {
    if (!workflowPath || !batonPath || outputPath || args.length !== 3) {
      fail('usage: node scripts/workflow-interpreter.mjs inspect <workflow.json> <baton.json>');
    }
    emit(inspectWorkflow(workflowPath, batonPath));
  } else if (mode === 'apply') {
    if (!workflowPath || !batonPath || !outputPath || args.length !== 4) {
      fail('usage: node scripts/workflow-interpreter.mjs apply <workflow.json> <baton.json> <worker-output.json>');
    }
    emit(applyWorkflowOutput(workflowPath, batonPath, outputPath));
  } else {
    const [legacyWorkflowPath, legacyBatonPath, legacyOutputPath] = args;
    if (!legacyWorkflowPath || !legacyBatonPath || !legacyOutputPath || args.length !== 3) {
      fail('usage: node scripts/workflow-interpreter.mjs inspect <workflow.json> <baton.json> | apply <workflow.json> <baton.json> <worker-output.json>');
    }
    emit(applyWorkflowOutput(legacyWorkflowPath, legacyBatonPath, legacyOutputPath));
  }
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  throw error;
}
