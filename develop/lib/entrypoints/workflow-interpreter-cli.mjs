import { parseArgs } from 'node:util';
import { applyWorkflowOutput, inspectWorkflow, renderWorkflow } from '../use-cases/index.mjs';
import { WorkflowFileAdapter, RunStateFileAdapter } from '../persistence/index.mjs';
import { WorkflowOutputTransition } from '../entities/index.mjs';

const workflowFiles = new WorkflowFileAdapter();
const runStateFiles = new RunStateFileAdapter();
const workflowTransitions = new WorkflowOutputTransition();

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

function readInspectDtos({ workflowPath, batonPath }) {
  return runStateFiles.readInspectInput({ workflowPath, batonPath, readWorkflow: (path) => workflowFiles.readWorkflow(path) });
}

function readRenderDtos({ workflowPath, batonPath }) {
  return runStateFiles.readRenderInput({ workflowPath, batonPath, readWorkflow: (path) => workflowFiles.readWorkflow(path) });
}

function readApplyDtos({ workflowPath, batonPath, outputPath }) {
  return runStateFiles.readApplyInput({ workflowPath, batonPath, outputPath, readWorkflow: (path) => workflowFiles.readWorkflow(path) });
}

const DEFAULT_USAGE = 'usage: node develop/lib/bin/workflow-interpreter.mjs inspect <workflow.json> <baton.json> | render [--diagnostics] <workflow.json> <baton.json> | apply <workflow.json> <baton.json> <worker-output.json>';

const USAGE_BY_MODE = {
  inspect: 'usage: node develop/lib/bin/workflow-interpreter.mjs inspect <workflow.json> <baton.json>',
  render: 'usage: node develop/lib/bin/workflow-interpreter.mjs render [--diagnostics] <workflow.json> <baton.json>',
  apply: 'usage: node develop/lib/bin/workflow-interpreter.mjs apply <workflow.json> <baton.json> <worker-output.json>',
};

const COMMANDS = {
  inspect: ({ workflowPath, batonPath }) => {
    const { workflow, baton } = readInspectDtos({ workflowPath, batonPath });
    return inspectWorkflow({ workflow, baton });
  },
  render: ({ workflowPath, batonPath, includeDiagnostics }) => {
    const { workflow, baton } = readRenderDtos({ workflowPath, batonPath });
    const response = inspectWorkflow({ workflow, baton });
    return renderWorkflow({
      workflow,
      baton,
      includeDiagnostics,
      renderSteps: workflowFiles.renderStepsForResponse({
        workflowPath,
        workflow,
        response,
        repositoryRoot: workflowFiles.repositoryRootForWorkflow(workflowPath),
      }),
    });
  },
  apply: ({ workflowPath, batonPath, outputPath }) => {
    const { workflow, baton, outputValue } = readApplyDtos({ workflowPath, batonPath, outputPath });
    return applyWorkflowOutput({
      workflow,
      baton,
      outputValue,
      outputPath,
      workflowPath,
      repositoryRoot: workflowFiles.repositoryRootForWorkflow(workflowPath),
      readStepOutput: (args) => workflowFiles.readStepOutput(args),
      validateStepOutput: (args) => workflowFiles.validateStepOutput(args),
      isParallelOutputEnvelope: (value) => workflowFiles.isParallelOutputEnvelope(value),
      applyParallelBranchOutput: (args) => workflowFiles.applyParallelBranchOutput(args),
      prepareParallelBranch: (args) => workflowTransitions.prepareParallelBranch(args),
      applyNextTransition: (args) => workflowTransitions.applyNextTransition(args),
    });
  },
};

function usageForArgs(args) {
  const [mode] = args;
  return USAGE_BY_MODE[mode] ?? DEFAULT_USAGE;
}

function isPathArg(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateWorkflowInterpreterCliArgs(args) {
  if (args.length < 3) return false;
  const [mode, workflowPath, batonPath, outputPath, ...extra] = args;
  if (!['inspect', 'render', 'apply'].includes(mode)) return false;
  if (!isPathArg(workflowPath) || !isPathArg(batonPath)) return false;
  if (mode === 'apply') return isPathArg(outputPath) && extra.length === 0;
  return outputPath === undefined && extra.length === 0;
}

function assertCliArgs(args) {
  if (!validateWorkflowInterpreterCliArgs(args)) fail(usageForArgs(args));
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const { args, includeDiagnostics } = parseCliArgs(argv);
    assertCliArgs(args);

    const [mode, workflowPath, batonPath, outputPath] = args;
    const command = COMMANDS[mode];
    emit(command({ workflowPath, batonPath, outputPath, includeDiagnostics }));
  } catch (error) {
    if (error?.name === 'WorkflowInterpreterError') fail(error.message);
    throw error;
  }
}
