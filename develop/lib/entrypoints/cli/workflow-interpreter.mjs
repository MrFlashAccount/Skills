#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { validateWorkflowInterpreterCliArgs } from '../../dtos/cli-args-validation.mjs';
import { defaultRepositoryRootForWorkflow } from '../../persistence/resource-resolver.mjs';
import { WorkflowInterpreterError } from '../../entities/Workflow/errors.mjs';
import { applyWorkflowOutput, inspectWorkflow, renderWorkflow } from '../../use-cases/interpreter/index.mjs';

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

const DEFAULT_USAGE = 'usage: node develop/lib/bin/workflow-interpreter.mjs inspect <workflow.json> <baton.json> | render [--diagnostics] <workflow.json> <baton.json> | apply <workflow.json> <baton.json> <worker-output.json>';

const USAGE_BY_MODE = {
  inspect: 'usage: node develop/lib/bin/workflow-interpreter.mjs inspect <workflow.json> <baton.json>',
  render: 'usage: node develop/lib/bin/workflow-interpreter.mjs render [--diagnostics] <workflow.json> <baton.json>',
  apply: 'usage: node develop/lib/bin/workflow-interpreter.mjs apply <workflow.json> <baton.json> <worker-output.json>',
};

const COMMANDS = {
  inspect: ({ workflowPath, batonPath }) => inspectWorkflow(workflowPath, batonPath),
  render: ({ workflowPath, batonPath, includeDiagnostics }) => renderWorkflow(workflowPath, batonPath, { includeDiagnostics, repositoryRoot: defaultRepositoryRootForWorkflow(workflowPath) }),
  apply: ({ workflowPath, batonPath, outputPath }) => applyWorkflowOutput(workflowPath, batonPath, outputPath, undefined, { repositoryRoot: defaultRepositoryRootForWorkflow(workflowPath) }),
};

function usageForArgs(args) {
  const [mode] = args;
  return USAGE_BY_MODE[mode] ?? DEFAULT_USAGE;
}

function assertCliArgs(args) {
  if (!validateWorkflowInterpreterCliArgs(args)) fail(usageForArgs(args));
}

try {
  const { args, includeDiagnostics } = parseCliArgs(process.argv.slice(2));
  assertCliArgs(args);

  const [mode, workflowPath, batonPath, outputPath] = args;
  const command = COMMANDS[mode];
  emit(command({ workflowPath, batonPath, outputPath, includeDiagnostics }));
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  throw error;
}
