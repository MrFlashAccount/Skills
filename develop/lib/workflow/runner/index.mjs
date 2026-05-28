import { join } from 'node:path';
import { applyWorkflowOutput, renderWorkflow } from '../interpreter/index.mjs';
import { assertSafeStepId, instructionPathForStep, responseStatusForInterpreterResponse, toRunnerResponse } from './host-requests.mjs';
import { appendHistory, ensureRunFiles, pathExists, persistRunnerResponse, readJson, readText, repositoryRoot, resolveRunPaths, writeJsonAtomic, writeTextAtomic } from './run-state.mjs';

async function persistStepInstructions(paths, interpreterResponse) {
  if (responseStatusForInterpreterResponse(interpreterResponse) !== 'needs_host_actions') return;

  for (const step of interpreterResponse.steps ?? []) {
    if (!step.compiledPrompt?.prompt) throw new Error(`missing compiled instructions for workflow step '${step.id}'`);
    await writeTextAtomic(instructionPathForStep(paths.instructionsDir, step.id), step.compiledPrompt.prompt);
  }
}

async function runnerResponseForRendered(paths, rendered, { initialized, resumed }) {
  await persistStepInstructions(paths, rendered);
  const response = {
    ...toRunnerResponse(rendered, { outputsDir: paths.outputsDir, runDir: paths.runDir }),
    runDir: paths.runDir,
    workflow: paths.workflowPath,
    initialized,
    resumed,
  };
  await persistRunnerResponse(paths, response);
  return response;
}

export async function next({ runDir, workflowPath, includeDiagnostics = false }) {
  const paths = resolveRunPaths({ runDir, workflowPath });
  const runState = await ensureRunFiles(paths);
  const rendered = renderWorkflow(paths.workflowPath, paths.batonPath, { includeDiagnostics, repositoryRoot });
  return runnerResponseForRendered(paths, rendered, {
    initialized: runState.initialized,
    resumed: runState.resumed,
  });
}

async function outputPathForCurrentState(paths) {
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  if (lastResponse.status !== 'needs_host_actions') throw new Error(`last runner response is '${lastResponse.status}', not needs_host_actions`);

  const missing = [];
  for (const request of lastResponse.requests ?? []) {
    if (!(await pathExists(request.outputPath))) missing.push(request.outputPath);
  }
  if (missing.length > 0) throw new Error(`missing host output: ${missing.join(', ')}`);

  if ((lastResponse.requests ?? []).length === 1) return { outputPath: lastResponse.requests[0].outputPath, usedEnvelope: false };

  const steps = {};
  for (const request of lastResponse.requests) steps[request.id] = await readJson(request.outputPath, `host output ${request.id}`);
  const envelopePath = join(paths.runnerDir, 'parallel-output.json');
  await writeJsonAtomic(envelopePath, { steps });
  return { outputPath: envelopePath, usedEnvelope: true };
}

export async function continueRun({ runDir, workflowPath, includeDiagnostics = false }) {
  const paths = resolveRunPaths({ runDir, workflowPath });
  await ensureRunFiles(paths);
  const { outputPath } = await outputPathForCurrentState(paths);
  const applied = applyWorkflowOutput(paths.workflowPath, paths.batonPath, outputPath);
  await writeJsonAtomic(paths.batonPath, applied.baton);
  await appendHistory(paths, { source: 'workflow-runner-continue', baton: applied.baton, output: outputPath });

  const rendered = renderWorkflow(paths.workflowPath, paths.batonPath, { includeDiagnostics, repositoryRoot });
  return runnerResponseForRendered(paths, rendered, { initialized: false, resumed: true });
}

export async function loadInstructions({ runDir, stepId }) {
  assertSafeStepId(stepId);
  const paths = resolveRunPaths({ runDir });
  const lastResponse = await readJson(paths.lastResponsePath, 'last runner response');
  const request = (lastResponse.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
  if (lastResponse.status !== 'needs_host_actions' || !request) throw new Error(`unknown current workflow step id: ${stepId}`);

  return readText(instructionPathForStep(paths.instructionsDir, stepId), `instructions for workflow step ${stepId}`);
}
