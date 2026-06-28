import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { applyWorkflowOutput } from '../../use-cases/ApplyWorkflowOutput.mjs';
import { validateAgainstOutputSchema } from '../../use-cases/runtime/output/output-schema-validation.mjs';
import { workerOutputSchema } from '../../use-cases/runtime/output/worker-output-schema.mjs';
import { renderAppliedResponse } from '../../use-cases/ContinueRun.mjs';
import { runNext } from '../../use-cases/RunNext.mjs';
import { resolveStartupUserPrompt, startupUserPromptTarget } from '../../use-cases/user-prompt.mjs';
import { loadWorkflowRuntime } from '../../persistence/workflow-resources/runtime-reader.mjs';
import { writePersistedRunStateUpdate } from '../../persistence/run-state/PersistedRunStateWriter.mjs';
import { toHostResponse } from './runner/host-requests.mjs';
import { renderStepInstructionsForStep } from './runner/host-instructions/pipeline.mjs';
import { assertSafeStepId, writeOutputCommandForStep } from './runner/runner-command-builder.mjs';
import { readText } from '../../persistence/run-state/atomic-file.mjs';
import { assertFreshTokenAuthority, assertMatchingTokenAuthority, buildTokenLease, renewTokenLease } from '../../persistence/run-state/lease-authority.mjs';
import { recoverDurableCommit } from '../../persistence/run-state/durable-commit.mjs';
import { readPersistedRunState } from '../../persistence/run-state/PersistedRunStateReader.mjs';
import { ensureRunFiles, pathExists, resolveRunPaths } from '../../persistence/run-state/paths.mjs';
import { createRunIndexEntry, readRunsIndex, runsIndexPathsForRoot, upsertRunIndexEntry } from '../../persistence/run-state/run-index.mjs';
import { withRunStateLock } from '../../persistence/run-state/lock.mjs';
import { publicErrorMessage } from '../cli/public-error.mjs';
import { assertAbsoluteWorkflowPath } from '../../workflow-path-boundary.mjs';

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

async function runnerResponseForRendered(paths, rendered, { initialized, resumed, leaseToken, includeInlineInstructions = false }) {
  const workflowDoc = await readJson(paths.workflowPath, 'workflow');
  return {
    ...toHostResponse(rendered, {
      runId: paths.runId,
      workflow: workflowDoc,
      workflowPath: paths.workflowPath,
      repositoryRoot: paths.repositoryRoot,
      runsRoot: paths.runsRoot,
      leaseToken,
      includeInlineInstructions,
    }),
    runId: paths.runId,
    initialized,
    resumed,
  };
}

async function assertWorkerLeaseAuthority(paths, { leaseToken, now = new Date(), allowStale = false } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  if (allowStale) assertMatchingTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId });
  else assertFreshTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId, now });
}

async function assertPreLockWorkerLeaseAuthority(paths, { leaseToken, now = new Date(), allowUnclaimed = false, allowStale = false } = {}) {
  if (!leaseToken) throw new Error('workflow run token is required');
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  if (!run && allowUnclaimed) return;
  if (allowStale) assertMatchingTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId });
  else assertFreshTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId, now });
}

async function renewedWorkerLeaseAuthority(paths, { leaseToken, now = new Date() } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  assertMatchingTokenAuthority(run?.workerLease, leaseToken, { runId: paths.runId });
  return renewTokenLease(run.workerLease, { now });
}

async function initializeMissingRunLease(paths, { leaseToken, now = new Date() } = {}) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  if (index.runs[paths.runId]) return false;
  const hasExistingRunState = await pathExists(paths.batonPath) || await pathExists(paths.historyPath);
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

async function persistNextHostResponse(paths, rendered, runState, { leaseToken } = {}) {
  const persistedResponse = await runnerResponseForRendered(paths, rendered, runState);
  await writePersistedRunStateUpdate(paths, {
    baton: persistedResponse.baton,
    history: { source: 'workflow-runner', baton: persistedResponse.baton, requests: persistedResponse.requests },
    writeBaton: runState.initialized,
  });
  return runnerResponseForRendered(paths, rendered, { ...runState, leaseToken, includeInlineInstructions: true });
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

function resourcesWithValidatingWriter(resources, paths, { leaseToken } = {}) {
  return {
    ...resources,
    validatingWriterCommandForStep: (stepId) => writeOutputCommandForStep(paths.runId, stepId, {
      runsRoot: paths.runsRoot,
      leaseToken,
    }),
    artifactOutputDirForStep: (stepId) => {
      assertSafeStepId(stepId);
      return join(paths.runDir, stepId, 'artifacts');
    },
  };
}

async function renderCurrentHostResponse(paths, baton, { leaseToken, includeDiagnostics = false, includeInlineInstructions = false } = {}) {
  const runtime = loadWorkflowRuntime({ workflowPath: paths.workflowPath, batonPath: paths.batonPath, baton });
  const renderResources = resourcesWithValidatingWriter(runtime.resources, paths, { leaseToken });
  const rendered = runNext({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, resources: renderResources, includeDiagnostics });
  const response = await runnerResponseForRendered(paths, rendered, {
    initialized: false,
    resumed: true,
    leaseToken,
    includeInlineInstructions,
  });
  return { runtime, rendered, response };
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
      const runtime = loadWorkflowRuntime({ workflowPath: paths.workflowPath, batonPath: paths.batonPath, baton: persisted.baton });
      const renderResources = resourcesWithValidatingWriter(runtime.resources, paths, { leaseToken });
      const rendered = runNext({ workflowDoc: runtime.workflow, batonDoc: persisted.baton, resources: renderResources, includeDiagnostics });
      const response = await persistNextHostResponse(paths, rendered, {
        initialized: runState.initialized,
        resumed: runState.resumed,
      }, { leaseToken });
      const workerLease = await renewedWorkerLeaseAuthority(paths, { leaseToken, now });
      await upsertRunIndexEntry(paths, { status: response.status, workflowPath: paths.workflowPath, taskKey, taskFingerprint, workerLease });
      return response;
    } catch (error) {
      if (createdIndexEntry) await markNewRunFailed(paths);
      throw error;
    }
  });
}

function requestAliases(request) {
  return [request.id, request.stepId].filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index);
}

function stepIdForRequest(request) {
  return request.stepId ?? request.id;
}

function acceptedOutputForRequest(baton, request) {
  const outputs = baton?.state?.outputs;
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return undefined;
  for (const alias of requestAliases(request)) {
    if (Object.hasOwn(outputs, alias)) return structuredClone(outputs[alias]);
  }
  return undefined;
}

function acceptedOutputsForRequests(baton, requests) {
  const valuesByRequestId = new Map();
  const missing = [];
  for (const request of requests) {
    const value = acceptedOutputForRequest(baton, request);
    if (value === undefined) missing.push(request.id);
    else valuesByRequestId.set(request.id, value);
  }
  return { valuesByRequestId, missing };
}

function parsedOutputRefsForAcceptedState(baton, requests) {
  const outputs = baton?.state?.outputs;
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return [];
  const currentAliases = new Set(requests.flatMap(requestAliases));
  return Object.keys(outputs)
    .filter((stepId) => currentAliases.has(stepId))
    .map((stepId) => ({ stepId }));
}

function assertNamedOutputRefsMatchRequests(parsedOutputRefs, requests) {
  const allowedAliases = new Set(requests.flatMap(requestAliases));
  const mismatched = parsedOutputRefs
    .map((ref) => ref.stepId)
    .filter((stepId) => typeof stepId !== 'string' || !allowedAliases.has(stepId));
  if (mismatched.length > 0) {
    throw new Error(`host output step id does not match current workflow request: ${mismatched.join(', ')}`);
  }
}

function outputForAcceptedState(currentBaton, requests, { isPreparedParallelContinuation }) {
  const parsedOutputRefs = parsedOutputRefsForAcceptedState(currentBaton, requests);
  assertNamedOutputRefsMatchRequests(parsedOutputRefs, requests);
  const { valuesByRequestId, missing } = acceptedOutputsForRequests(currentBaton, requests);
  if (missing.length > 0) {
    throw new Error(`missing accepted host output for workflow step ${missing.join(', ')}; run workflow-runner write-output first`);
  }
  if (requests.length === 1 && !isPreparedParallelContinuation) {
    const request = requests[0];
    return { outputValue: valuesByRequestId.get(request.id), historyOutput: `accepted:${stepIdForRequest(request)}`, currentBaton };
  }

  const steps = {};
  const historyOutput = [];
  for (const request of requests) {
    const stepId = stepIdForRequest(request);
    steps[stepId] = valuesByRequestId.get(request.id);
    historyOutput.push(`accepted:${stepId}`);
  }
  return { outputValue: { steps }, historyOutput: historyOutput.join(', '), currentBaton };
}


async function outputForCurrentState(paths) {
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const { response } = await renderCurrentHostResponse(paths, current.baton);
  if (response.status !== 'needs_host_actions') throw new Error(`current runner response is '${response.status}', not needs_host_actions`);

  const requests = response.requests ?? [];
  const isPreparedParallelContinuation = requests.some((request) => stepIdForRequest(request) !== current.baton?.cursor);
  return outputForAcceptedState(current.baton, requests, { isPreparedParallelContinuation });
}

async function resolveIndexedRunPaths({ runId, workflowPath, runsRoot }) {
  workflowPath = assertAbsoluteWorkflowPath(workflowPath);
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
  if (output !== undefined && (!Array.isArray(output) || output.length > 0)) {
    throw new Error('workflow-runner continue no longer accepts --output; run workflow-runner write-output for each current request, then continue without --output');
  }
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now, allowStale: true });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runId, workflowPath, runsRoot });
    await assertWorkerLeaseAuthority(paths, { leaseToken, now, allowStale: true });
    await ensureRunFiles(paths);
    await recoverDurableCommit(paths);
    const { outputValue, historyOutput, currentBaton } = await outputForCurrentState(paths);
    const runtime = loadWorkflowRuntime({ workflowPath: paths.workflowPath, batonPath: paths.batonPath, baton: currentBaton });
    const applied = applyWorkflowOutput({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, outputValue, resources: runtime.resources });
    const renderResources = resourcesWithValidatingWriter(runtime.resources, paths, { leaseToken });
    const rendered = renderAppliedResponse({ workflowDoc: runtime.workflow, response: applied, resources: renderResources, includeDiagnostics });

    const response = await runnerResponseForRendered(paths, rendered, { initialized: false, resumed: true, leaseToken, includeInlineInstructions: true });
    const workerLease = await renewedWorkerLeaseAuthority(paths, { leaseToken, now });
    await writePersistedRunStateUpdate(paths, {
      baton: applied.baton,
      history: { source: 'workflow-runner-continue', baton: applied.baton, output: historyOutput, requests: response.requests },
    });
    await upsertRunIndexEntry(paths, { status: response.status, workflowPath: paths.workflowPath, workerLease });
    return response;
  });
}

export async function continueRun(options = {}) {
  return publicApiCall(() => continueRunInternal(options), { runsRoot: options.runsRoot });
}

function parseOutputJson(json) {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`invalid JSON for workflow output: ${error.message}`);
  }
}

function currentRequestForStep(response, requestedStepId) {
  const requests = response.requests ?? [];
  return requests.find((request) => requestAliases(request).includes(requestedStepId));
}

function currentRequestStepIds(response) {
  return (response.requests ?? [])
    .map(stepIdForRequest)
    .filter((stepId, index, values) => typeof stepId === 'string' && stepId.length > 0 && values.indexOf(stepId) === index);
}

function staleWorkflowCommandError(stepId, response) {
  const current = currentRequestStepIds(response);
  const currentText = current.length > 0 ? current.join(', ') : 'none';
  return new Error(`stale workflow-runner command from an older response: requested step '${stepId}' is no longer valid for the current workflow state (current request step ids: ${currentText}). Use the latest workflow-runner response/instructions.`);
}

function validateAcceptedOutputForRequest({ workflow, resources, request, output }) {
  const requestStepId = stepIdForRequest(request);
  const step = workflow.steps?.[requestStepId];
  if (!step) throw new Error(`unknown current workflow step id: ${requestStepId}`);
  const schemaRef = step.output?.schema;
  const artifactOutputDir = typeof resources?.artifactOutputDirForStep === 'function' ? resources.artifactOutputDirForStep(requestStepId) : undefined;
  const loaded = schemaRef
    ? (resources?.outputSchemas instanceof Map ? resources.outputSchemas.get(schemaRef) : resources?.outputSchemas?.[schemaRef])
    : undefined;
  const schema = schemaRef ? (loaded?.schema ?? loaded) : (request.action === 'run_worker' ? workerOutputSchema : undefined);
  if (schemaRef && !schema) throw new Error(`output schema validation failed: missing output.schema '${schemaRef}'`);
  if (!schema) return output;
  const validation = validateAgainstOutputSchema({ schemaRef: schemaRef ?? 'worker-output', schema, output, artifactOutputDir });
  if (!validation.ok) throw new Error(`output schema validation failed for step '${requestStepId}': ${validation.errors}`);
  return validation.output;
}

function batonWithAcceptedOutput(baton, stepId, output) {
  const nextBaton = structuredClone(baton);
  nextBaton.state = {
    ...nextBaton.state,
    outputs: {
      ...(nextBaton.state?.outputs ?? {}),
      [stepId]: structuredClone(output),
    },
  };
  return nextBaton;
}

function assertAgentId(agentId) {
  if (
    typeof agentId !== 'string' ||
    agentId.trim().length === 0 ||
    /[\r\n\0]/.test(agentId)
  ) {
    throw new Error('workflow agent id must be a non-empty single-line string');
  }
}

function batonWithWorkerBinding(baton, stepId, agentId) {
  const nextBaton = structuredClone(baton);
  nextBaton.workerBindings = {
    ...(nextBaton.workerBindings ?? {}),
    [stepId]: agentId,
  };
  return nextBaton;
}

async function writeOutputInternal({ runId, workflowPath, stepId, json, leaseToken, now = new Date(), runsRoot } = {}) {
  assertSafeStepId(stepId);
  const output = parseOutputJson(json);
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now, allowStale: true });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runId, workflowPath, runsRoot });
    await assertWorkerLeaseAuthority(paths, { leaseToken, now, allowStale: true });
    await ensureRunFiles(paths);
    await recoverDurableCommit(paths);
    const current = await readPersistedRunState(paths);
    const { runtime, response } = await renderCurrentHostResponse(paths, current.baton, { leaseToken });
    if (response.status !== 'needs_host_actions') throw staleWorkflowCommandError(stepId, response);
    const request = currentRequestForStep(response, stepId);
    if (!request) throw staleWorkflowCommandError(stepId, response);
    const validationResources = resourcesWithValidatingWriter(runtime.resources, paths, { leaseToken });
    const accepted = validateAcceptedOutputForRequest({ workflow: runtime.workflow, resources: validationResources, request, output });
    const acceptedStepId = stepIdForRequest(request);
    const baton = batonWithAcceptedOutput(current.baton, acceptedStepId, accepted);
    await writePersistedRunStateUpdate(paths, {
      baton,
      history: { source: 'workflow-runner-write-output', baton, output: `accepted:${acceptedStepId}`, requests: response.requests ?? [] },
    });
    const workerLease = await renewedWorkerLeaseAuthority(paths, { leaseToken, now });
    await upsertRunIndexEntry(paths, { workflowPath: paths.workflowPath, workerLease });
    return {
      ok: true,
      runId: paths.runId,
      stepId: acceptedStepId,
      accepted: true,
    };
  });
}

export async function writeOutput(options = {}) {
  return publicApiCall(() => writeOutputInternal(options), { runsRoot: options.runsRoot });
}

async function bindAgentInternal({ runId, workflowPath, stepId, agentId, leaseToken, now = new Date(), runsRoot } = {}) {
  assertSafeStepId(stepId);
  assertAgentId(agentId);
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now, allowStale: true });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runId, workflowPath, runsRoot });
    await assertWorkerLeaseAuthority(paths, { leaseToken, now, allowStale: true });
    await ensureRunFiles(paths);
    await recoverDurableCommit(paths);
    const current = await readPersistedRunState(paths);
    const { response } = await renderCurrentHostResponse(paths, current.baton, { leaseToken });
    if (response.status !== 'needs_host_actions') throw staleWorkflowCommandError(stepId, response);
    const request = currentRequestForStep(response, stepId);
    if (!request) throw staleWorkflowCommandError(stepId, response);
    if (request.action !== 'run_worker') throw new Error(`workflow step '${stepId}' is not a run_worker request`);
    const acceptedStepId = stepIdForRequest(request);
    const baton = batonWithWorkerBinding(current.baton, acceptedStepId, agentId);
    await writePersistedRunStateUpdate(paths, {
      baton,
      history: { source: 'workflow-runner-bind-agent', baton, output: `bound-agent:${acceptedStepId}`, requests: response.requests ?? [] },
    });
    const workerLease = await renewedWorkerLeaseAuthority(paths, { leaseToken, now });
    await upsertRunIndexEntry(paths, { workflowPath: paths.workflowPath, workerLease });
    return {
      ok: true,
      runId: paths.runId,
      stepId: acceptedStepId,
      bound: true,
    };
  });
}

export async function bindAgent(options = {}) {
  return publicApiCall(() => bindAgentInternal(options), { runsRoot: options.runsRoot });
}

async function loadInstructionsInternal({ runId, workflowPath, stepId, followUp = false, leaseToken, now = new Date(), runsRoot } = {}) {
  assertSafeStepId(stepId);
  if (followUp !== true && followUp !== false) throw new Error('followUp must be a boolean');
  const lockPaths = resolveRunPaths({ runId, runsRoot });
  await assertPreLockWorkerLeaseAuthority(lockPaths, { leaseToken, now });
  return withRunStateLock(lockPaths, async () => {
    const paths = await resolveIndexedRunPaths({ runId, workflowPath, runsRoot });
    await assertWorkerLeaseAuthority(paths, { leaseToken, now });
    await recoverDurableCommit(paths);
    const current = await readPersistedRunState(paths);
    const { rendered, response } = await renderCurrentHostResponse(paths, current.baton, { leaseToken });
    if (response.status !== 'needs_host_actions') throw staleWorkflowCommandError(stepId, response);
    const request = currentRequestForStep(response, stepId);
    if (!request) throw staleWorkflowCommandError(stepId, response);
    const renderedStep = (rendered.steps ?? []).find((step) => step.id === stepIdForRequest(request));
    if (!renderedStep) throw new Error(`missing rendered workflow step '${stepIdForRequest(request)}'`);
    const instructions = renderStepInstructionsForStep(renderedStep, {
      request,
      runId: paths.runId,
      runsRoot: paths.runsRoot,
      leaseToken,
    });
    if (typeof instructions !== 'string' || instructions.trim().length === 0) {
      throw new Error(`missing instructions for workflow step '${stepIdForRequest(request)}'`);
    }
    const workerLease = await renewedWorkerLeaseAuthority(paths, { leaseToken, now });
    await upsertRunIndexEntry(paths, { workflowPath: paths.workflowPath, workerLease });
    return instructions;
  });
}

export async function loadInstructions(options = {}) {
  return publicApiCall(() => loadInstructionsInternal(options), { runsRoot: options.runsRoot });
}
