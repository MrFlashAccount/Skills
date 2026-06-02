import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { applyWorkflowOutput } from '../../use-cases/ApplyWorkflowOutput.mjs';
import { renderAppliedResponse } from '../../use-cases/ContinueRun.mjs';
import { runNext } from '../../use-cases/RunNext.mjs';
import { loadInstructions as loadInstructionsUseCase } from '../../use-cases/LoadInstructions.mjs';
import { resolveStartupUserPrompt, startupUserPromptTarget } from '../../use-cases/user-prompt.mjs';
import { loadWorkflowRuntime, readWorkerOutputText } from '../../persistence/workflow-resources/runtime-reader.mjs';
import { read as readInstructionDTO } from '../../persistence/workflow-resources/instruction-file-reader.mjs';
import { writePersistedRunStateUpdate } from '../../persistence/run-state/PersistedRunStateWriter.mjs';
import { assertSafeStepId, instructionPathForStep, responseStatusForInterpreterResponse, toHostResponse } from './runner/host-requests.mjs';
import { readText } from '../../persistence/run-state/atomic-file.mjs';
import { assertFreshTokenAuthority, buildTokenLease } from '../../persistence/run-state/lease-authority.mjs';
import { recoverDurableCommit } from '../../persistence/run-state/durable-commit.mjs';
import { readPersistedRunState } from '../../persistence/run-state/PersistedRunStateReader.mjs';
import { projectRuntimeRunState } from '../../persistence/run-state/persisted-state-schema.mjs';
import { ensureRunFiles, pathExists, resolveRunPaths, workflowRunsRoot } from '../../persistence/run-state/paths.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot, upsertRunIndexEntry } from '../../persistence/run-state/run-index.mjs';
import { withRunStateLock } from '../../persistence/run-state/lock.mjs';
import { publicErrorMessage } from '../cli/public-error.mjs';

async function readJson(pathname, kind) {
  let content;
  try {
    content = await readFile(pathname, 'utf8');
  } catch (error) {
    const code = typeof error?.code === 'string' ? `: ${error.code}` : '';
    throw new Error(`failed to read ${kind} JSON${code}`);
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`failed to parse ${kind} JSON: ${error.message}`);
  }
}

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
    ...toHostResponse(rendered, {
      runId: paths.runId,
      workflow: workflowDoc,
      workflowPath: paths.workflowPath,
      repositoryRoot: paths.repositoryRoot,
      runsRoot: paths.runsRoot === workflowRunsRoot ? undefined : paths.runsRoot,
    }),
    runId: paths.runId,
    initialized,
    resumed,
  };
}

async function assertWorkerLeaseAuthority(paths, { leaseToken, now = new Date() } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  assertFreshTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId, now });
}

async function assertPreLockWorkerLeaseAuthority(paths, { leaseToken, now = new Date(), allowUnclaimed = false } = {}) {
  if (!leaseToken) throw new Error('workflow run token is required');
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  if (!run && allowUnclaimed) return;
  assertFreshTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId, now });
}

async function initializeMissingRunLease(paths, { leaseToken, now = new Date() } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  if (index.runs[paths.runId]) return false;
  const hasExistingRunState = await pathExists(paths.batonPath) || await pathExists(paths.historyPath) || await pathExists(paths.lastResponsePath);
  if (hasExistingRunState) {
    throw new Error(`workflow run requires indexed lease authority: ${paths.runId}`);
  }
  await createRunIndexEntry(paths, {
    status: 'running',
    workflowPath: paths.workflowPath,
    workerLease: buildTokenLease({ token: leaseToken, now }),
  });
  return true;
}

async function markNewRunFailed(paths) {
  await upsertRunIndexEntry(paths, {
    status: 'failed',
    workflowPath: paths.workflowPath,
    workerLease: null,
  });
}

async function indexedWorkflowPathForRun(paths) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  return index.runs[paths.runId]?.workflow?.path;
}

async function persistNextHostResponse(paths, rendered, runState) {
  const response = await runnerResponseForRendered(paths, rendered, runState);
  await writePersistedRunStateUpdate(paths, {
    response,
    baton: response.baton,
    instructions: stepInstructionsFor(paths, rendered),
    history: { source: 'workflow-runner', baton: response.baton, requests: response.requests },
    writeBaton: runState.initialized,
  });
  return response;
}

function publicApiError(error, options = {}) {
  const redacted = new Error(publicErrorMessage(error?.message ?? error, options));
  if (error?.code) redacted.code = error.code;
  return redacted;
}

async function publicApiCall(callback, options = {}) {
  try { return await callback(); }
  catch (error) { throw publicApiError(error, options); }
}

async function nextInternal({ runId, workflowPath, includeDiagnostics = false, userPrompt, userPromptFile, taskKey, taskFingerprint, leaseToken, now = new Date(), runsRoot } = {}) {
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now, allowUnclaimed: true });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveIndexedRunPaths({ runId, workflowPath, runsRoot });
    const createdIndexEntry = await initializeMissingRunLease(paths, { leaseToken, now });
    try {
      await assertWorkerLeaseAuthority(paths, { leaseToken, now });
      const hasExistingBaton = await pathExists(paths.batonPath);
      if (!hasExistingBaton && userPromptFile !== undefined && String(userPromptFile).trim().length === 0) {
        throw new Error('--user-prompt-file path must not be empty or whitespace-only');
      }
      const userPromptFileContent = (!hasExistingBaton && userPromptFile !== undefined) ? await readText(userPromptFile, '--user-prompt-file') : undefined;
      const startupUserPrompt = hasExistingBaton ? undefined : resolveStartupUserPrompt({ userPrompt, userPromptFileContent });
      const workflowDoc = startupUserPrompt === undefined ? undefined : await readJson(paths.workflowPath, 'workflow');
      const startupPromptTarget = startupUserPrompt === undefined
        ? undefined
        : startupUserPromptTarget({ workflow: workflowDoc, start: workflowDoc?.start });
      const runState = await ensureRunFiles(paths, { userPrompt: startupUserPrompt, userPromptTarget: startupPromptTarget });
      await recoverDurableCommit(paths);
      const persisted = await readPersistedRunState(paths);
      const runtimeState = projectRuntimeRunState(persisted);
      const runtime = loadWorkflowRuntime({ workflowPath: paths.workflowPath, batonPath: paths.batonPath, baton: runtimeState.baton });
      const rendered = runNext({ workflowDoc: runtime.workflow, batonDoc: runtimeState.baton, resources: runtime.resources, includeDiagnostics });
      const response = await persistNextHostResponse(paths, rendered, {
        initialized: runState.initialized,
        resumed: runState.resumed,
      });
      await upsertRunIndexEntry(paths, { status: response.status, workflowPath: paths.workflowPath, taskKey, taskFingerprint });
      return response;
    } catch (error) {
      if (createdIndexEntry) await markNewRunFailed(paths);
      throw error;
    }
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

function assertLastResponseMatchesCurrentBaton(lastResponse, currentBaton) {
  if (!isDeepStrictEqual(lastResponse.baton, currentBaton)) {
    throw new Error('stale last runner response: persisted baton no longer matches last-response context; run workflow-runner next before continue');
  }
}


async function outputForCurrentState(paths, outputRefs = []) {
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const lastResponse = current.lastResponse;
  if (lastResponse?.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse?.status}', not needs_host_actions`);
  assertLastResponseMatchesCurrentBaton(lastResponse, current.baton);

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
    return { outputPath: pathsByRequestId.get(requests[0].id), outputValue: undefined, historyOutput: pathsByRequestId.get(requests[0].id), currentBaton: current.baton };
  }

  const steps = {};
  const historyOutput = [];
  for (const request of requests) {
    const outputPath = pathsByRequestId.get(request.id);
    const stepId = stepIdForRequest(request);
    steps[stepId] = await readJson(outputPath, `host output ${stepId}`);
    historyOutput.push(`${stepId}=${outputPath}`);
  }
  return { outputPath: '<parallel host outputs>', outputValue: { steps }, historyOutput: historyOutput.join(', '), currentBaton: current.baton };
}

async function resolveIndexedRunPaths({ runId, workflowPath, runsRoot }) {
  const defaultPaths = resolveRunPaths({ runId, runsRoot });
  const indexedWorkflowPath = await indexedWorkflowPathForRun(defaultPaths);
  if (typeof indexedWorkflowPath === 'string' && indexedWorkflowPath.length > 0) {
    if (workflowPath && resolve(indexedWorkflowPath) !== resolve(workflowPath)) {
      throw new Error(`workflow run is already bound to a different workflow: ${runId}`);
    }
    return resolveRunPaths({ runId, workflowPath: indexedWorkflowPath, runsRoot });
  }
  return workflowPath ? resolveRunPaths({ runId, workflowPath, runsRoot }) : defaultPaths;
}

async function resolveContinueRunPaths({ runId, workflowPath, runsRoot }) {
  return resolveIndexedRunPaths({ runId, workflowPath, runsRoot });
}

export async function next(options = {}) {
  return publicApiCall(() => nextInternal(options), { runsRoot: options.runsRoot });
}

async function continueRunInternal({ runId, workflowPath, output, includeDiagnostics = false, leaseToken, now = new Date(), runsRoot } = {}) {
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runId, workflowPath, runsRoot });
    await assertWorkerLeaseAuthority(paths, { leaseToken, now });
    await ensureRunFiles(paths);
    await recoverDurableCommit(paths);
    const { outputPath, outputValue, historyOutput, currentBaton } = await outputForCurrentState(paths, normalizeOutputRefs(output));
    const runtime = loadWorkflowRuntime({ workflowPath: paths.workflowPath, batonPath: paths.batonPath, baton: currentBaton });
    const outputContent = outputValue === undefined ? readWorkerOutputText({ outputPath }) : undefined;
    const applied = applyWorkflowOutput({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, outputContent, outputValue, resources: runtime.resources });
    const rendered = renderAppliedResponse({ workflowDoc: runtime.workflow, response: applied, resources: runtime.resources, includeDiagnostics });

    const response = await runnerResponseForRendered(paths, rendered, { initialized: false, resumed: true });
    await writePersistedRunStateUpdate(paths, {
      response,
      baton: applied.baton,
      instructions: stepInstructionsFor(paths, rendered),
      history: { source: 'workflow-runner-continue', baton: applied.baton, output: historyOutput, requests: response.requests },
    });
    await upsertRunIndexEntry(paths, { status: response.status, workflowPath: paths.workflowPath });
    return response;
  });
}

export async function continueRun(options = {}) {
  return publicApiCall(() => continueRunInternal(options), { runsRoot: options.runsRoot });
}

async function loadInstructionsInternal({ runId, workflowPath, stepId, leaseToken, now = new Date(), runsRoot } = {}) {
  assertSafeStepId(stepId);
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now });
  return withRunStateLock(lockPaths, async () => {
    const paths = resolveRunPaths({ runId, runsRoot });
    await assertWorkerLeaseAuthority(paths, { leaseToken, now });
    await recoverDurableCommit(paths);
    const current = await readPersistedRunState(paths);
    const lastResponse = current.lastResponse;
    if (lastResponse?.status !== 'needs_host_actions') throw new Error(`unknown current workflow step id: ${stepId}`);
    const runtimePaths = await resolveIndexedRunPaths({ runId, workflowPath, runsRoot });
    assertLastResponseMatchesCurrentBaton(lastResponse, current.baton);
    const runtime = loadWorkflowRuntime({ workflowPath: runtimePaths.workflowPath, batonPath: paths.batonPath, baton: current.baton });
    const instructionPath = instructionPathForStep(paths.instructionsDir, stepId);
    loadInstructionsUseCase({
      workflowDTO: runtime.workflow,
      runStateDTO: { baton: runtime.baton, requests: lastResponse.requests ?? [], responseStatus: lastResponse.status },
      instructionDTO: { path: instructionPath, content: '' },
      resources: runtime.resources,
      stepId,
    });

    const instruction = await readInstructionDTO(instructionPath, `instructions for workflow step ${stepId}`);
    return instruction.toJSON().content;
  });
}

export async function loadInstructions(options = {}) {
  return publicApiCall(() => loadInstructionsInternal(options), { runsRoot: options.runsRoot });
}
