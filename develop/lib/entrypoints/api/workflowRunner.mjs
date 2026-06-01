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
import { recoverDurableCommit } from '../../persistence/run-state/durable-commit.mjs';
import { readPersistedRunState } from '../../persistence/run-state/PersistedRunStateReader.mjs';
import { projectRuntimeRunState } from '../../persistence/run-state/persisted-state-schema.mjs';
import { ensureRunFiles, pathExists, resolveRunPaths } from '../../persistence/run-state/paths.mjs';
import { readRunsIndex, runsIndexPathsForRoot, upsertRunIndexEntry } from '../../persistence/run-state/run-index.mjs';
import { withRunStateLock } from '../../persistence/run-state/lock.mjs';

async function readJson(pathname, kind) {
  try {
    return JSON.parse(await readFile(pathname, 'utf8'));
  } catch (error) {
    throw new Error(`failed to read ${kind} JSON '${pathname}': ${error.message}`);
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
    }),
    runId: paths.runId,
    workflow: paths.workflowPath,
    initialized,
    resumed,
  };
}

const LEASE_IDENTITY_FIELDS = ['owner', 'harness', 'sessionId', 'workerId'];

function leaseIdentityKeys(metadata = {}) {
  return LEASE_IDENTITY_FIELDS.filter((key) => metadata[key] !== undefined);
}

function toLeaseMetadata({ owner, harness, sessionId, workerId } = {}) {
  const metadata = { owner, harness, sessionId, workerId };
  for (const key of Object.keys(metadata)) if (metadata[key] === undefined) delete metadata[key];
  return metadata;
}

function leaseIdentityMatches(existingLease, requestedMetadata) {
  const existingKeys = leaseIdentityKeys(existingLease);
  const requestedKeys = leaseIdentityKeys(requestedMetadata);
  if (existingKeys.length === 0 || requestedKeys.length === 0) return false;
  if (existingKeys.length !== requestedKeys.length) return false;
  if (!existingKeys.every((key) => requestedKeys.includes(key))) return false;
  return existingKeys.every((key) => existingLease?.[key] === requestedMetadata[key]);
}

async function assertWorkerLeaseAuthority(paths, { owner, harness, sessionId, workerId, now = new Date() } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  if (!run?.workerLease) return;
  const expiresAt = Date.parse(run.workerLease.leaseExpiresAt ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) throw new Error(`workflow run lease is stale: ${paths.runId}`);
  if (!leaseIdentityMatches(run.workerLease, toLeaseMetadata({ owner, harness, sessionId, workerId }))) {
    throw new Error(`workflow run is occupied: ${paths.runId}`);
  }
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

export async function next({ runId, workflowPath, includeDiagnostics = false, userPrompt, userPromptFile, taskKey, taskFingerprint, owner, harness, sessionId, workerId, now = new Date() } = {}) {
  const paths = resolveRunPaths({ runId, workflowPath });
  return withRunStateLock(paths, async () => {
    await assertWorkerLeaseAuthority(paths, { owner, harness, sessionId, workerId, now });
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
    await upsertRunIndexEntry(paths, { status: 'running', workflowPath: paths.workflowPath, taskKey, taskFingerprint });
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

function assertLastResponseMatchesWorkflowPath(lastResponse, workflowPath) {
  if (typeof lastResponse.workflow !== 'string' || lastResponse.workflow.length === 0) return;
  if (resolve(lastResponse.workflow) !== resolve(workflowPath)) {
    throw new Error('stale last runner response: requested workflow does not match last-response workflow context; run workflow-runner next with the requested workflow before continue');
  }
}

async function outputForCurrentState(paths, outputRefs = []) {
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const lastResponse = current.lastResponse;
  if (lastResponse?.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse?.status}', not needs_host_actions`);
  assertLastResponseMatchesWorkflowPath(lastResponse, paths.workflowPath);
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

async function resolveContinueRunPaths({ runId, workflowPath }) {
  if (workflowPath) return resolveRunPaths({ runId, workflowPath });

  const paths = resolveRunPaths({ runId });
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const lastResponse = current.lastResponse;
  if (typeof lastResponse?.workflow !== 'string' || lastResponse.workflow.length === 0) return paths;
  return resolveRunPaths({ runId, workflowPath: lastResponse.workflow });
}

export async function continueRun({ runId, workflowPath, output, includeDiagnostics = false, owner, harness, sessionId, workerId, now = new Date() }) {
  const lockPaths = resolveRunPaths({ runId });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runId, workflowPath });
    await assertWorkerLeaseAuthority(paths, { owner, harness, sessionId, workerId, now });
    await ensureRunFiles(paths);
    await upsertRunIndexEntry(paths, { status: 'running', workflowPath: paths.workflowPath });
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

export async function loadInstructions({ runId, workflowPath, stepId, owner, harness, sessionId, workerId, now = new Date() }) {
  assertSafeStepId(stepId);
  const paths = resolveRunPaths({ runId });
  await assertWorkerLeaseAuthority(paths, { owner, harness, sessionId, workerId, now });
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const lastResponse = current.lastResponse;
  if (lastResponse?.status !== 'needs_host_actions') throw new Error(`unknown current workflow step id: ${stepId}`);
  if (workflowPath) assertLastResponseMatchesWorkflowPath(lastResponse, resolveRunPaths({ runId, workflowPath }).workflowPath);
  assertLastResponseMatchesCurrentBaton(lastResponse, current.baton);
  const runtimePaths = typeof lastResponse.workflow === 'string' && lastResponse.workflow.length > 0
    ? resolveRunPaths({ runId, workflowPath: lastResponse.workflow })
    : paths;
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
}
