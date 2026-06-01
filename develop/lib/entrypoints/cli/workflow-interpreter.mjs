#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { validateWorkflowRuntimeCliArgs } from './cli-args-validation.mjs';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { applyWorkflowOutput } from '../../use-cases/ApplyWorkflowOutput.mjs';
import { inspectWorkflow } from '../../use-cases/InspectWorkflow.mjs';
import { runNext } from '../../use-cases/RunNext.mjs';
import { loadWorkflowRuntime, readWorkerOutputText } from '../../persistence/workflow-resources/runtime-reader.mjs';

function fail(message) {
  console.error(`workflow-interpreter: ${message}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    if (argv.includes('--diagnostics')) {
      const parsed = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { diagnostics: { type: 'boolean', default: false } },
      });
      return { args: parsed.positionals, includeDiagnostics: parsed.values.diagnostics };
    }
    return { args: parseArgs({ args: ['--', ...argv], allowPositionals: true }).positionals, includeDiagnostics: false };
  } catch (error) {
    fail(error.message);
  }
}

function emit(response) {
  console.log(JSON.stringify(response, null, 2));
}

const DEFAULT_USAGE = 'usage: node develop/lib/entrypoints/cli/workflow-interpreter.mjs inspect <workflow.json> <baton.json> | render [--diagnostics] <workflow.json> <baton.json> | apply <workflow.json> <baton.json> <worker-output.json>';

const USAGE_BY_MODE = {
  inspect: 'usage: node develop/lib/entrypoints/cli/workflow-interpreter.mjs inspect <workflow.json> <baton.json>',
  render: 'usage: node develop/lib/entrypoints/cli/workflow-interpreter.mjs render [--diagnostics] <workflow.json> <baton.json>',
  apply: 'usage: node develop/lib/entrypoints/cli/workflow-interpreter.mjs apply <workflow.json> <baton.json> <worker-output.json>',
};

const COMMANDS = {
  inspect: ({ workflowPath, batonPath }) => {
    const runtime = loadWorkflowRuntime({ workflowPath, batonPath });
    return inspectWorkflow({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, resources: runtime.resources });
  },
  render: ({ workflowPath, batonPath, includeDiagnostics }) => {
    const runtime = loadWorkflowRuntime({ workflowPath, batonPath });
    return runNext({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, resources: runtime.resources, includeDiagnostics });
  },
  apply: ({ workflowPath, batonPath, outputPath }) => {
    const runtime = loadWorkflowRuntime({ workflowPath, batonPath });
    return applyWorkflowOutput({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, outputContent: readWorkerOutputText({ outputPath }), resources: runtime.resources });
  },
};

function usageForArgs(args) {
  const [mode] = args;
  return USAGE_BY_MODE[mode] ?? DEFAULT_USAGE;
}

function assertCliArgs(args) {
  if (!validateWorkflowRuntimeCliArgs(args)) fail(usageForArgs(args));
}

try {
  const { args, includeDiagnostics } = parseCliArgs(process.argv.slice(2));
  assertCliArgs(args);

  const [mode, workflowPath, batonPath, outputPath] = args;
  const command = COMMANDS[mode];
  emit(command({ workflowPath, batonPath, outputPath, includeDiagnostics }));
} catch (error) {
  if (error instanceof WorkflowRuntimeError) fail(error.message);
  throw error;
}
