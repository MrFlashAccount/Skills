import { join } from 'node:path';
import { applyWorkflowOutput, renderInterpreterResponse, renderWorkflow } from '../interpreter/index.mjs';
import { assertSafeStepId, instructionPathForStep, responseStatusForInterpreterResponse, toRunnerResponse } from './host-requests.mjs';
import { appendHistory, ensureRunFiles, pathExists, persistRunnerResponse, readJson, readText, repositoryRoot, resolveRunPaths, withContinueRunLock, writeJsonAtomic, writeTextAtomic } from './run-state.mjs';

async function persistStepInstructions(paths, interpreterResponse) {
  if (responseStatusForInterpreterResponse(interpreterResponse) !== 'needs_host_actions') return;

  for (const step of interpreterResponse.steps ?? []) {
    if (!step.compiledPrompt?.prompt) throw new Error(`missing compiled instructions for workflow step '${step.id}'`);
    await writeTextAtomic(instructionPathForStep(paths.instructionsDir, step.id), step.compiledPrompt.prompt);
  }
}

async function runnerResponseForRendered(paths, rendered, { initialized, resumed }) {
  await persistStepInstructions(paths, rendered);
  if (rendered.baton?.user_prompt_injected === true) await writeJsonAtomic(paths.batonPath, rendered.baton);
  const workflowDoc = await readJson(paths.workflowPath, 'workflow');
  const response = {
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
  await persistRunnerResponse(paths, response);
  return response;
}

export async function next({ runDir, workflowPath, includeDiagnostics = false, userPrompt } = {}) {
  const paths = resolveRunPaths({ runDir, workflowPath });
  const runState = await ensureRunFiles(paths, { userPrompt });
  const rendered = renderWorkflow(paths.workflowPath, paths.batonPath, { includeDiagnostics, repositoryRoot });
  return runnerResponseForRendered(paths, rendered, {
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

async function outputPathForCurrentState(paths, outputRefs = []) {
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  if (lastResponse.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse.status}', not needs_host_actions`);

  const missing = [];
  const pathsByStep = new Map();
  for (const request of lastResponse.requests ?? []) {
    const outputPath = outputPathForRequest(request, outputRefs);
    pathsByStep.set(request.id, outputPath);
    if (!(await pathExists(outputPath))) missing.push(outputPath);
  }
  if (missing.length > 0) throw new Error(`missing host output: ${missing.join(', ')}`);

  if ((lastResponse.requests ?? []).length === 1) return { outputPath: pathsByStep.get(lastResponse.requests[0].id), usedEnvelope: false };

  const steps = {};
  for (const request of lastResponse.requests) steps[request.id] = await readJson(pathsByStep.get(request.id), `host output ${request.id}`);
  const envelopePath = join(paths.runnerDir, 'parallel-output.json');
  await writeJsonAtomic(envelopePath, { steps });
  return { outputPath: envelopePath, usedEnvelope: true };
}

async function resolveContinueRunPaths({ runDir, workflowPath }) {
  if (workflowPath) return resolveRunPaths({ runDir, workflowPath });

  const paths = resolveRunPaths({ runDir });
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  if (typeof lastResponse.workflow !== 'string' || lastResponse.workflow.length === 0) return paths;
  return resolveRunPaths({ runDir, workflowPath: lastResponse.workflow });
}

export async function continueRun({ runDir, workflowPath, output, includeDiagnostics = false }) {
  const lockPaths = resolveRunPaths({ runDir });
  return withContinueRunLock(lockPaths, async () => {
    const paths = await resolveContinueRunPaths({ runDir, workflowPath });
    await ensureRunFiles(paths);
    const { outputPath } = await outputPathForCurrentState(paths, normalizeOutputRefs(output));
    const applied = applyWorkflowOutput(paths.workflowPath, paths.batonPath, outputPath);
    await writeJsonAtomic(paths.batonPath, applied.baton);
    await appendHistory(paths, { source: 'workflow-runner-continue', baton: applied.baton, output: outputPath });

    const rendered = renderInterpreterResponse(paths.workflowPath, paths.batonPath, applied, { includeDiagnostics, repositoryRoot });
    return runnerResponseForRendered(paths, rendered, { initialized: false, resumed: true });
  });
}

export async function loadInstructions({ runDir, stepId }) {
  assertSafeStepId(stepId);
  const paths = resolveRunPaths({ runDir });
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  const request = (lastResponse.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
  if (lastResponse.status !== 'needs_host_actions' || !request) throw new Error(`unknown current workflow step id: ${stepId}`);

  return readText(instructionPathForStep(paths.instructionsDir, stepId), `instructions for workflow step ${stepId}`);
}
