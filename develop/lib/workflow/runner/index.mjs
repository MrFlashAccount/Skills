import { applyWorkflowOutput, renderInterpreterResponse, renderWorkflow } from '../interpreter/index.mjs';
import { assertSafeStepId, instructionPathForStep, responseStatusForInterpreterResponse, toRunnerResponse } from './host-requests.mjs';
import { commitDurableRunState, ensureRunFiles, pathExists, readJson, readText, recoverDurableCommit, repositoryRoot, resolveRunPaths, withContinueRunLock } from './run-state.mjs';

function stepInstructionsFor(paths, interpreterResponse) {
  if (responseStatusForInterpreterResponse(interpreterResponse) !== 'needs_host_actions') return [];

  return (interpreterResponse.steps ?? []).map((step) => {
    if (!step.compiledPrompt?.prompt) throw new Error(`missing compiled instructions for workflow step '${step.id}'`);
    return { path: instructionPathForStep(paths.instructionsDir, step.id), content: step.compiledPrompt.prompt };
  });
}

async function runnerResponseForRendered(paths, rendered, { initialized, resumed }) {
  const workflowDoc = await readJson(paths.workflowPath, 'workflow');
  return {
    ...toRunnerResponse(rendered, {
      runDir: paths.runDir,
      workflow: workflowDoc.workflow,
      workflowPath: paths.workflowPath,
      repositoryRoot,
    }),
    runDir: paths.runDir,
    workflow: paths.workflowPath,
    initialized,
    resumed,
  };
}

async function persistNextRunnerResponse(paths, rendered, runState) {
  const response = await runnerResponseForRendered(paths, rendered, runState);
  await commitDurableRunState(paths, {
    response,
    baton: response.baton,
    instructions: stepInstructionsFor(paths, rendered),
    history: { source: 'workflow-runner', baton: response.baton, requests: response.requests },
  });
  return response;
}

export async function next({ runDir, workflowPath, includeDiagnostics = false }) {
  const paths = resolveRunPaths({ runDir, workflowPath });
  const runState = await ensureRunFiles(paths);
  await recoverDurableCommit(paths);
  const rendered = renderWorkflow(paths.workflowPath, paths.batonPath, { includeDiagnostics, repositoryRoot });
  return persistNextRunnerResponse(paths, rendered, {
    initialized: runState.initialized,
    resumed: runState.resumed,
  });
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

function outputPathForRequest(request, outputRefs) {
  if (outputRefs.length === 0) throw new Error(`missing host output for workflow step ${request.id}`);
  const parsed = outputRefs.map(parseOutputRef);
  const named = parsed.filter((candidate) => candidate.stepId);
  if (named.length > 0) {
    const match = named.find((candidate) => candidate.stepId === request.id || candidate.stepId === request.stepId);
    if (!match?.path) throw new Error(`missing host output for workflow step ${request.id}`);
    return match.path;
  }
  if (outputRefs.length === 1) return parsed[0].path;
  throw new Error('parallel host outputs must use --output <step-id>=<path> for each requested step');
}

async function outputForCurrentState(paths, outputRefs = []) {
  await recoverDurableCommit(paths);
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  if (lastResponse.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse.status}', not needs_host_actions`);

  const missing = [];
  const requests = lastResponse.requests ?? [];
  const pathsByRequestId = new Map();
  for (const request of requests) {
    const outputPath = outputPathForRequest(request, outputRefs);
    pathsByRequestId.set(request.id, outputPath);
    if (!(await pathExists(outputPath))) missing.push(outputPath);
  }
  if (missing.length > 0) throw new Error(`missing host output: ${missing.join(', ')}`);

  const stepIdForRequest = (request) => request.stepId ?? request.id;
  const isPreparedParallelContinuation = requests.some((request) => stepIdForRequest(request) !== lastResponse.baton?.cursor);
  if (requests.length === 1 && !isPreparedParallelContinuation) {
    return { outputPath: pathsByRequestId.get(requests[0].id), outputValue: undefined, historyOutput: pathsByRequestId.get(requests[0].id) };
  }

  const steps = {};
  const historyOutput = [];
  for (const request of requests) {
    const outputPath = pathsByRequestId.get(request.id);
    const stepId = stepIdForRequest(request);
    steps[stepId] = await readJson(outputPath, `host output ${stepId}`);
    historyOutput.push(`${stepId}=${outputPath}`);
  }
  return { outputPath: '<parallel host outputs>', outputValue: { steps }, historyOutput: historyOutput.join(', ') };
}

async function resolveContinueRunPaths({ runDir, workflowPath }) {
  if (workflowPath) return resolveRunPaths({ runDir, workflowPath });

  const paths = resolveRunPaths({ runDir });
  await recoverDurableCommit(paths);
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  if (typeof lastResponse.workflow !== 'string' || lastResponse.workflow.length === 0) return paths;
  return resolveRunPaths({ runDir, workflowPath: lastResponse.workflow });
}

export async function continueRun({ runDir, workflowPath, output, includeDiagnostics = false }) {
  const lockPaths = resolveRunPaths({ runDir });
  return withContinueRunLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runDir, workflowPath });
    await ensureRunFiles(paths);
    await recoverDurableCommit(paths);
    const { outputPath, outputValue, historyOutput } = await outputForCurrentState(paths, normalizeOutputRefs(output));
    const applied = applyWorkflowOutput(paths.workflowPath, paths.batonPath, outputPath, outputValue);
    const rendered = renderInterpreterResponse(paths.workflowPath, paths.batonPath, applied, { includeDiagnostics, repositoryRoot });

    const response = await runnerResponseForRendered(paths, rendered, { initialized: false, resumed: true });
    await commitDurableRunState(paths, {
      response,
      baton: applied.baton,
      instructions: stepInstructionsFor(paths, rendered),
      history: { source: 'workflow-runner-continue', baton: applied.baton, output: historyOutput, requests: response.requests },
    });
    return response;
  });
}

export async function loadInstructions({ runDir, stepId }) {
  assertSafeStepId(stepId);
  const paths = resolveRunPaths({ runDir });
  await recoverDurableCommit(paths);
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  const request = (lastResponse.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
  if (lastResponse.status !== 'needs_host_actions' || !request) throw new Error(`unknown current workflow step id: ${stepId}`);

  return readText(instructionPathForStep(paths.instructionsDir, stepId), `instructions for workflow step ${stepId}`);
}
