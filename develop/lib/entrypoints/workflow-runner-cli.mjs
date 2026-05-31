import { parseArgs } from 'node:util';
import { continueRun, loadInstructions, next } from '../use-cases/index.mjs';
import { WorkflowFileAdapter, RunStateFileAdapter } from '../persistence/index.mjs';

const SAFE_STEP_ID = /^[A-Za-z0-9_.-]+$/;

function assertSafeStepId(stepId) {
  if (typeof stepId !== 'string' || !SAFE_STEP_ID.test(stepId) || stepId === '.' || stepId === '..') {
    throw new Error(`invalid workflow step id for runner storage: ${stepId}`);
  }
}

const workflowFiles = new WorkflowFileAdapter();
const runStateFiles = new RunStateFileAdapter();

function fail(message) {
  console.error(`workflow-runner: ${message}`);
  process.exit(1);
}

function usage() {
  return 'usage: node develop/lib/bin/workflow-runner.mjs next --run-dir <dir> [--workflow <workflow.json>] [--diagnostics] [--user-prompt <text> | --user-prompt-file <path>] | continue --run-dir <dir> --output <worker-output.json> [--output <step-id=worker-output.json> ...] [--workflow <workflow.json>] [--diagnostics] | instructions --run-dir <dir> --step-id <id>';
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['next', 'continue', 'instructions'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        'run-dir': { type: 'string' },
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
    if (!parsed.values['run-dir']) fail(usage());
    if (mode === 'instructions' && !parsed.values['step-id']) fail(usage());
    if (mode !== 'instructions' && parsed.values['step-id']) fail(usage());
    if (mode !== 'continue' && parsed.values.output?.length) fail(usage());
    if (mode !== 'next' && (parsed.values['user-prompt'] !== undefined || parsed.values['user-prompt-file'] !== undefined)) fail(usage());
    if (mode === 'instructions' && (parsed.values.workflow || parsed.values.diagnostics || parsed.values.output?.length)) fail(usage());
    return { mode, values: parsed.values };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

function normalizeOutputRefs(outputRefs) {
  if (outputRefs === undefined) return [];
  return Array.isArray(outputRefs) ? outputRefs : [outputRefs];
}

function parseOutputRef(ref) {
  const text = String(ref ?? '');
  const separator = text.indexOf('=');
  if (separator <= 0) return { path: text };
  const stepId = text.slice(0, separator);
  assertSafeStepId(stepId);
  return { stepId, path: text.slice(separator + 1) };
}

async function runNext(values, dependencies) {
  const runState = await runStateFiles.prepareNextRun({
    runDir: values['run-dir'],
    workflowPath: values.workflow,
    userPrompt: values['user-prompt'],
    userPromptFile: values['user-prompt-file'],
  });
  const workflow = runStateFiles.readRunWorkflow(runState, (path) => workflowFiles.readWorkflow(path));
  const workflowContext = runStateFiles.workflowContextForRun(runState);
  const useCaseResult = next({
    workflow,
    baton: runState.baton,
    renderSteps: (args) => dependencies.createRuntimeRenderSteps({ ...workflowContext, workflow, response: args.response })(args),
    runtime: dependencies.runtime,
    includeDiagnostics: values.diagnostics,
    initialized: runState.initialized,
    resumed: runState.resumed,
  });
  const packet = runStateFiles.buildNextPacket(runState, useCaseResult, workflow);
  await runStateFiles.commitNextResponse(runState, packet);
  return packet.response;
}

async function runContinue(values, dependencies) {
  return runStateFiles.withContinuationLock({ runDir: values['run-dir'] }, async () => {
    const runState = await runStateFiles.prepareContinueRun({ runDir: values['run-dir'], workflowPath: values.workflow });
    const output = await runStateFiles.readContinuationOutput(runState, normalizeOutputRefs(values.output).map(parseOutputRef));
    const workflow = runStateFiles.readRunWorkflow(runState, (path) => workflowFiles.readWorkflow(path));
    const workflowContext = runStateFiles.workflowContextForRun(runState);
    const useCaseResult = continueRun({
      workflow,
      baton: runState.baton,
      renderSteps: (args) => dependencies.createRuntimeRenderSteps({ ...workflowContext, workflow, response: args.response })(args),
      ...dependencies.createRuntimeApplyDependencies(workflowContext),
      runtime: dependencies.runtime,
      includeDiagnostics: values.diagnostics,
      ...output,
    });
    const packet = runStateFiles.buildContinuePacket(runState, useCaseResult, workflow);
    await runStateFiles.commitContinueResponse(runState, packet);
    return packet.response;
  });
}

async function runInstructions(values) {
  const stepId = values['step-id'];
  const input = await runStateFiles.readInstructions({ runDir: values['run-dir'], stepId });
  return loadInstructions({ lastResponse: input.lastResponse, stepId, instructionText: input.instructionText });
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  try {
    const { mode, values } = parseCliArgs(argv);
    if (mode === 'instructions') {
      process.stdout.write(await runInstructions(values));
    } else {
      const response = mode === 'next' ? await runNext(values, dependencies) : await runContinue(values, dependencies);
      console.log(JSON.stringify(response, null, 2));
    }
  } catch (error) {
    if (error?.name === 'WorkflowInterpreterError') fail(error.message);
    fail(error.message);
  }
}
