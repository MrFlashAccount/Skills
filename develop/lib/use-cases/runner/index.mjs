import { applyWorkflowOutput, renderInterpreterResponse, renderWorkflow } from '../interpreter/index.mjs';
import { resolveStartupUserPrompt, startupUserPromptTarget } from '../../entities/Baton/user-prompt.mjs';
import { assertSafeStepId, instructionPathForStep, responseStatusForInterpreterResponse, buildRunResponse } from './host-requests.mjs';


function workflowStart(workflowDoc, workflowPath) {
  const start = workflowDoc?.start;
  if (typeof start !== 'string' || start.length === 0) throw new Error(`workflow missing string start: ${workflowPath}`);
  return start;
}

async function ensureRunFiles(paths, { userPrompt, adapters } = {}) {
  const { ensureRunStorage, managedJsonFileExists, readJson, createJsonFileIfMissing, createHistoryFileIfMissing } = adapters;
  await ensureRunStorage(paths);
  const batonExists = await managedJsonFileExists(paths.batonPath, 'workflow baton');
  if (!batonExists) {
    const workflowDoc = await readJson(paths.workflowPath, 'workflow');
    const start = workflowStart(workflowDoc, paths.workflowPath);
    const initialBaton = {
      cursor: start,
      status: 'running',
      state: { artifacts: [], results: [] },
    };
    if (typeof userPrompt === 'string') {
      initialBaton.user_prompt = userPrompt;
      initialBaton.user_prompt_target = startupUserPromptTarget({ workflow: workflowDoc, start });
    }
    await createJsonFileIfMissing(paths.batonPath, initialBaton);
  }
  await createHistoryFileIfMissing(paths);
  return { initialized: !batonExists, resumed: batonExists };
}

function stepInstructionsFor(paths, interpreterResponse) {
  if (responseStatusForInterpreterResponse(interpreterResponse) !== 'needs_host_actions') return [];

  return (interpreterResponse.steps ?? []).map((step) => {
    if (!step.compiledPrompt?.prompt) throw new Error(`missing compiled instructions for workflow step '${step.id}'`);
    return { path: instructionPathForStep(paths.instructionsDir, step.id), content: step.compiledPrompt.prompt };
  });
}

async function runnerResponseForRendered(paths, rendered, { initialized, resumed, adapters }) {
  const { readJson, loadOutputSchema } = adapters;
  const workflowDoc = await readJson(paths.workflowPath, 'workflow');
  return {
    ...buildRunResponse(rendered, {
      runDir: paths.runDir,
      workflow: workflowDoc,
      workflowPath: paths.workflowPath,
      repositoryRoot: paths.repositoryRoot,
      loadOutputSchema,
    }),
    runDir: paths.runDir,
    workflow: paths.workflowPath,
    initialized,
    resumed,
  };
}

async function persistNextRunState(paths, rendered, runState) {
  const { commitDurableRunState } = runState.adapters;
  const response = await runnerResponseForRendered(paths, rendered, runState);
  await commitDurableRunState(paths, {
    response,
    baton: response.baton,
    instructions: stepInstructionsFor(paths, rendered),
    history: { source: 'workflow-runner', baton: response.baton, requests: response.requests },
    writeBaton: runState.initialized,
  });
  return response;
}

export async function next({ runDir, workflowPath, includeDiagnostics = false, userPrompt, userPromptFile, resourceAdapters: adapters } = {}) {
  const paths = adapters.resolveRunPaths({ runDir, workflowPath });
  const startupUserPrompt = (await adapters.pathExists(paths.batonPath)) ? undefined : await resolveStartupUserPrompt({ userPrompt, userPromptFile });
  const runState = await ensureRunFiles(paths, { userPrompt: startupUserPrompt, adapters });
  await adapters.recoverDurableCommit(paths);
  const rendered = renderWorkflow(paths.workflowPath, paths.batonPath, { includeDiagnostics, repositoryRoot: paths.repositoryRoot, resourceAdapters: adapters });
  return persistNextRunState(paths, rendered, {
    initialized: runState.initialized,
    resumed: runState.resumed,
    adapters,
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

function requestAliases(request) {
  return [request.id, request.stepId].filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index);
}

function requestIdForOutputStepId(requests, stepId) {
  for (const request of requests) {
    if (requestAliases(request).includes(stepId)) return request.id;
  }
  return undefined;
}

function assertNamedOutputRefsMatchRequests(parsed, requests) {
  const named = parsed.filter((candidate) => candidate.stepId);
  if (named.length === 0) return;
  if (named.length !== parsed.length) throw new Error('host outputs must not mix named and unnamed --output refs');

  const seenStepIds = new Set();
  const seenRequestIds = new Set();
  for (const candidate of named) {
    if (seenStepIds.has(candidate.stepId)) throw new Error(`duplicate host output for workflow step ${candidate.stepId}`);
    seenStepIds.add(candidate.stepId);

    const requestId = requestIdForOutputStepId(requests, candidate.stepId);
    if (!requestId) throw new Error(`unknown host output for workflow step ${candidate.stepId}`);
    if (seenRequestIds.has(requestId)) throw new Error(`duplicate host output for workflow step ${requestId}`);
    seenRequestIds.add(requestId);
  }
}

function outputPathForRequest(request, parsedOutputRefs, { requireNamed = false } = {}) {
  if (parsedOutputRefs.length === 0) throw new Error(`missing host output for workflow step ${request.id}`);
  const named = parsedOutputRefs.filter((candidate) => candidate.stepId);
  if (requireNamed && named.length === 0) throw new Error('parallel host outputs must use --output <step-id>=<path> for each requested step');
  if (named.length > 0) {
    const aliases = requestAliases(request);
    const match = named.find((candidate) => aliases.includes(candidate.stepId));
    if (!match?.path) throw new Error(`missing host output for workflow step ${request.id}`);
    return match.path;
  }
  if (parsedOutputRefs.length === 1) return parsedOutputRefs[0].path;
  throw new Error('parallel host outputs must use --output <step-id>=<path> for each requested step');
}

async function outputForCurrentState(paths, outputRefs = [], adapters) {
  const { recoverDurableCommit, readJson, pathExists } = adapters;
  await recoverDurableCommit(paths);
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  if (lastResponse.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse.status}', not needs_host_actions`);

  const missing = [];
  const requests = lastResponse.requests ?? [];
  const stepIdForRequest = (request) => request.stepId ?? request.id;
  const isPreparedParallelContinuation = requests.some((request) => stepIdForRequest(request) !== lastResponse.baton?.cursor);
  const requireNamedParallelOutputs = requests.length > 1 && isPreparedParallelContinuation;
  const parsedOutputRefs = outputRefs.map(parseOutputRef);
  assertNamedOutputRefsMatchRequests(parsedOutputRefs, requests);

  const pathsByRequestId = new Map();
  for (const request of requests) {
    const outputPath = outputPathForRequest(request, parsedOutputRefs, { requireNamed: requireNamedParallelOutputs });
    pathsByRequestId.set(request.id, outputPath);
    if (!(await pathExists(outputPath))) missing.push(outputPath);
  }
  if (missing.length > 0) throw new Error(`missing host output: ${missing.join(', ')}`);

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

async function resolveContinueRunPaths({ runDir, workflowPath, adapters }) {
  if (workflowPath) return adapters.resolveRunPaths({ runDir, workflowPath });

  const paths = adapters.resolveRunPaths({ runDir });
  await adapters.recoverDurableCommit(paths);
  const lastResponse = await adapters.readJson(paths.lastResponsePath, 'last runner response');
  if (typeof lastResponse.workflow !== 'string' || lastResponse.workflow.length === 0) return paths;
  return adapters.resolveRunPaths({ runDir, workflowPath: lastResponse.workflow });
}

export async function continueRun({ runDir, workflowPath, output, includeDiagnostics = false, resourceAdapters: adapters } = {}) {
  const lockPaths = adapters.resolveRunPaths({ runDir });
  return adapters.withContinueRunLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runDir, workflowPath, adapters });
    await ensureRunFiles(paths, { adapters });
    await adapters.recoverDurableCommit(paths);
    const { outputPath, outputValue, historyOutput } = await outputForCurrentState(paths, normalizeOutputRefs(output), adapters);
    const applied = applyWorkflowOutput(paths.workflowPath, paths.batonPath, outputPath, outputValue, { repositoryRoot: paths.repositoryRoot, resourceAdapters: adapters });
    const rendered = renderInterpreterResponse(paths.workflowPath, paths.batonPath, applied, { includeDiagnostics, repositoryRoot: paths.repositoryRoot, resourceAdapters: adapters });

    const response = await runnerResponseForRendered(paths, rendered, { initialized: false, resumed: true, adapters });
    await adapters.commitDurableRunState(paths, {
      response,
      baton: applied.baton,
      instructions: stepInstructionsFor(paths, rendered),
      history: { source: 'workflow-runner-continue', baton: applied.baton, output: historyOutput, requests: response.requests },
    });
    return response;
  });
}

export async function loadInstructions({ runDir, stepId, resourceAdapters: adapters } = {}) {
  assertSafeStepId(stepId);
  const paths = adapters.resolveRunPaths({ runDir });
  await adapters.recoverDurableCommit(paths);
  const lastResponse = await adapters.readJson(paths.lastResponsePath, 'last runner response');
  const request = (lastResponse.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
  if (lastResponse.status !== 'needs_host_actions' || !request) throw new Error(`unknown current workflow step id: ${stepId}`);

  return adapters.readText(instructionPathForStep(paths.instructionsDir, stepId), `instructions for workflow step ${stepId}`);
}
