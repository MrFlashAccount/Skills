import { readFile } from 'node:fs/promises';
import { instructionPathForStep, responseStatusForInterpreterResponse, toRunnerResponse } from '../workflow/runner/host-requests.mjs';
import { pathExists, readJson, readText, recoverDurableCommit, resolveRunPaths } from '../workflow/runner/run-state.mjs';
import { readJson as readJsonSync } from '../workflow/json-io.mjs';
import { commitDurableRunState, ensureRunFiles, withContinueRunLock } from '../workflow/runner/run-state.mjs';
import { resolveStartupUserPrompt } from '../workflow/user-prompt.mjs';

const runStateTokens = new WeakMap();

function tokenFor(paths) {
  const token = {};
  runStateTokens.set(token, paths);
  return token;
}

function pathsFor(token) {
  const paths = runStateTokens.get(token);
  if (!paths) throw new Error('invalid run state token');
  return paths;
}

function stateFor(paths, fields = {}) {
  return {
    runStateToken: tokenFor(paths),
    runDir: paths.runDir,
    workflowPath: paths.workflowPath,
    repositoryRoot: paths.repositoryRoot,
    batonPath: paths.batonPath,
    historyPath: paths.historyPath,
    ...fields,
  };
}

function instructionWritesFor(paths, interpreterResponse) {
  if (responseStatusForInterpreterResponse(interpreterResponse) !== 'needs_host_actions') return [];

  return (interpreterResponse.steps ?? []).map((step) => {
    if (!step.compiledPrompt?.prompt) throw new Error(`missing compiled instructions for workflow step '${step.id}'`);
    return { path: instructionPathForStep(paths.instructionsDir, step.id), content: step.compiledPrompt.prompt };
  });
}

function runnerResponseFor(paths, interpreterResponse, { workflow, initialized, resumed }) {
  return {
    ...toRunnerResponse(interpreterResponse, {
      runDir: paths.runDir,
      workflow,
      workflowPath: paths.workflowPath,
      repositoryRoot: paths.repositoryRoot,
    }),
    runDir: paths.runDir,
    workflow: paths.workflowPath,
    initialized,
    resumed,
  };
}

async function tryReadHostOutput(path) {
  try {
    return { outputValue: JSON.parse(await readFile(path, 'utf8')), outputParseError: undefined };
  } catch (error) {
    return { outputValue: undefined, outputParseError: error };
  }
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

/** Task-shaped filesystem adapter for workflow runner run-state DTOs. */
export class RunStateFileAdapter {
  readInspectInput({ workflowPath, batonPath, readWorkflow }) {
    if (typeof readWorkflow !== 'function') throw new Error('readWorkflow dependency is required');
    return { workflow: readWorkflow(workflowPath), baton: readJsonSync(batonPath, 'baton') };
  }

  readRenderInput({ workflowPath, batonPath, readWorkflow }) {
    return this.readInspectInput({ workflowPath, batonPath, readWorkflow });
  }

  readApplyInput({ workflowPath, batonPath, outputPath, readWorkflow }) {
    return {
      ...(workflowPath && batonPath ? this.readInspectInput({ workflowPath, batonPath, readWorkflow }) : {}),
      outputValue: readJsonSync(outputPath, 'worker output'),
    };
  }

  async prepareStartedRun({ runDir, workflowPath }) {
    const paths = resolveRunPaths({ runDir, workflowPath });
    const { resumed } = await ensureRunFiles(paths);
    return stateFor(paths, { initialized: !resumed, resumed, baton: await readJson(paths.batonPath, 'baton') });
  }

  async prepareNextRun({ runDir, workflowPath, userPrompt, userPromptFile }) {
    const paths = resolveRunPaths({ runDir, workflowPath });
    const startupUserPrompt = (await pathExists(paths.batonPath)) ? undefined : await resolveStartupUserPrompt({ userPrompt, userPromptFile });
    const runState = await ensureRunFiles(paths, { userPrompt: startupUserPrompt });
    await recoverDurableCommit(paths);
    return stateFor(paths, { ...runState, baton: await readJson(paths.batonPath, 'baton') });
  }

  buildNextPacket(runState, useCaseResult, workflow) {
    const paths = pathsFor(runState.runStateToken);
    const response = runnerResponseFor(paths, useCaseResult.rendered, {
      workflow,
      initialized: useCaseResult.initialized,
      resumed: useCaseResult.resumed,
    });
    return {
      response,
      baton: response.baton,
      instructions: instructionWritesFor(paths, useCaseResult.rendered),
      history: { source: 'workflow-runner', baton: response.baton, requests: response.requests },
    };
  }

  buildContinuePacket(runState, useCaseResult, workflow) {
    const paths = pathsFor(runState.runStateToken);
    const response = runnerResponseFor(paths, useCaseResult.rendered, {
      workflow,
      initialized: false,
      resumed: true,
    });
    return {
      response,
      baton: useCaseResult.baton,
      instructions: instructionWritesFor(paths, useCaseResult.rendered),
      history: { source: 'workflow-runner-continue', baton: useCaseResult.baton, output: useCaseResult.historyOutput, requests: response.requests },
    };
  }

  commitNextResponse(runState, packet) {
    return commitDurableRunState(pathsFor(runState.runStateToken), { ...packet, writeBaton: runState.initialized });
  }

  commitContinueResponse(runState, packet) {
    return commitDurableRunState(pathsFor(runState.runStateToken), packet);
  }

  withContinuationLock({ runDir }, callback) {
    return withContinueRunLock(resolveRunPaths({ runDir }), callback);
  }

  async prepareContinueRun({ runDir, workflowPath }) {
    let paths = resolveRunPaths({ runDir, workflowPath });
    if (!workflowPath) {
      await recoverDurableCommit(paths);
      const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
      if (typeof lastResponse.workflow === 'string' && lastResponse.workflow.length > 0) paths = resolveRunPaths({ runDir, workflowPath: lastResponse.workflow });
    }
    await ensureRunFiles(paths);
    await recoverDurableCommit(paths);
    return stateFor(paths, { baton: await readJson(paths.batonPath, 'baton') });
  }

  async readContinuationOutput(runState, outputRefs = []) {
    const paths = pathsFor(runState.runStateToken);
    await recoverDurableCommit(paths);
    const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
    if (lastResponse.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse.status}', not needs_host_actions`);

    const missing = [];
    const requests = lastResponse.requests ?? [];
    const stepIdForRequest = (request) => request.stepId ?? request.id;
    const isPreparedParallelContinuation = requests.some((request) => stepIdForRequest(request) !== lastResponse.baton?.cursor);
    const requireNamedParallelOutputs = requests.length > 1 && isPreparedParallelContinuation;
    assertNamedOutputRefsMatchRequests(outputRefs, requests);

    const pathsByRequestId = new Map();
    for (const request of requests) {
      const outputPath = outputPathForRequest(request, outputRefs, { requireNamed: requireNamedParallelOutputs });
      pathsByRequestId.set(request.id, outputPath);
      if (!(await pathExists(outputPath))) missing.push(outputPath);
    }
    if (missing.length > 0) throw new Error(`missing host output: ${missing.join(', ')}`);

    if (requests.length === 1 && !isPreparedParallelContinuation) {
      const outputPath = pathsByRequestId.get(requests[0].id);
      return { outputPath, ...(await tryReadHostOutput(outputPath)), historyOutput: outputPath };
    }

    const steps = {};
    const historyOutput = [];
    for (const request of requests) {
      const outputPath = pathsByRequestId.get(request.id);
      const stepId = stepIdForRequest(request);
      steps[stepId] = await readJson(outputPath, `host output ${stepId}`);
      historyOutput.push(`${stepId}=${outputPath}`);
    }
    return { outputPath: '<parallel host outputs>', outputValue: { steps }, outputParseError: undefined, historyOutput: historyOutput.join(', ') };
  }

  async readInstructions({ runDir, stepId }) {
    const paths = resolveRunPaths({ runDir });
    await recoverDurableCommit(paths);
    const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
    const request = (lastResponse.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
    if (lastResponse.status !== 'needs_host_actions' || !request) return { lastResponse, instructionText: '' };
    return {
      lastResponse,
      instructionText: await readText(instructionPathForStep(paths.instructionsDir, stepId), `instructions for workflow step ${stepId}`),
    };
  }
}
