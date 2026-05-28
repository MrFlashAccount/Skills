import { join } from 'node:path';
import { applyWorkflowOutput, renderWorkflow } from '../interpreter/index.mjs';
import { toRunnerResponse } from './host-requests.mjs';
import { appendHistory, ensureRunFiles, pathExists, persistRunnerResponse, readJson, repositoryRoot, resolveRunPaths, writeJsonAtomic } from './run-state.mjs';

export async function next({ runDir, workflowPath, includeDiagnostics = false }) {
  const paths = resolveRunPaths({ runDir, workflowPath });
  const runState = await ensureRunFiles(paths);
  const interpreterResponse = renderWorkflow(paths.workflowPath, paths.batonPath, { includeDiagnostics, repositoryRoot });
  const response = {
    ...toRunnerResponse(interpreterResponse, { outputsDir: paths.outputsDir }),
    runDir: paths.runDir,
    workflow: paths.workflowPath,
    initialized: runState.initialized,
    resumed: runState.resumed,
  };
  await persistRunnerResponse(paths, response);
  return response;
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
  const response = {
    ...toRunnerResponse(rendered, { outputsDir: paths.outputsDir }),
    runDir: paths.runDir,
    workflow: paths.workflowPath,
    initialized: false,
    resumed: true,
  };
  await persistRunnerResponse(paths, response);
  return response;
}
