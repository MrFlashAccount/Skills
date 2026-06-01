import { constants } from 'node:fs';
import { access, mkdir, open, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRepositoryRootForWorkflow } from '../workflow-resources/resource-resolver.mjs';
import { assertManagedRunStateFile } from './atomic-file.mjs';
import { runsIndexPathsForRoot } from './run-index.mjs';

const runnerDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(runnerDir, '../../../..');
export const defaultWorkflowPath = join(repositoryRoot, 'workflows/dev-harness/workflow.json');
export const workflowRunsRoot = join(repositoryRoot, 'develop/.workflow-runs');

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) throw new Error('runId is required');
  if (!SAFE_RUN_ID.test(runId)) throw new Error(`invalid workflow runId: ${runId}`);
  if (runId === '.' || runId === '..') throw new Error(`invalid workflow runId: ${runId}`);
  if (runId.includes('/') || runId.includes('\\')) throw new Error(`invalid workflow runId: ${runId}`);
  if (isAbsolute(runId) || runId.startsWith('~') || runId.startsWith('$')) throw new Error(`invalid workflow runId: ${runId}`);
  if (normalize(runId) !== runId || basename(runId) !== runId) throw new Error(`invalid workflow runId: ${runId}`);
  return runId;
}

export function runDirForRunId(runId) {
  assertSafeRunId(runId);
  return join(workflowRunsRoot, runId);
}

export function resolveRunPaths({ runId, workflowPath }) {
  const safeRunId = assertSafeRunId(runId);
  const resolvedRunDir = runDirForRunId(safeRunId);
  const resolvedWorkflowPath = resolve(workflowPath ?? defaultWorkflowPath);
  const indexPaths = runsIndexPathsForRoot(workflowRunsRoot);
  return {
    runId: safeRunId,
    runsRoot: indexPaths.runsRoot,
    runsIndexPath: indexPaths.runsIndexPath,
    runsIndexLockPath: indexPaths.runsIndexLockPath,
    runDir: resolvedRunDir,
    workflowPath: resolvedWorkflowPath,
    repositoryRoot: defaultRepositoryRootForWorkflow(resolvedWorkflowPath),
    batonPath: join(resolvedRunDir, 'baton.json'),
    historyPath: join(resolvedRunDir, 'history.md'),
    runnerDir: join(resolvedRunDir, '.workflow-runner'),
    instructionsDir: join(resolvedRunDir, '.workflow-runner', 'instructions'),
    lastResponsePath: join(resolvedRunDir, '.workflow-runner', 'last-response.json'),
    continueLockPath: join(resolvedRunDir, '.workflow-runner', 'continue.lock'),
    durableCommitPath: join(resolvedRunDir, '.workflow-runner', 'durable-commit.json'),
  };
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

export async function pathExists(path) { return exists(path); }

async function readJson(path, name) {
  const { readFile } = await import('node:fs/promises');
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`cannot read ${name} from ${path}: ${error.message}`); }
  try { return JSON.parse(content); }
  catch (error) { throw new Error(`cannot parse ${name} from ${path}: ${error.message}`); }
}

async function createFileIfMissing(path, content) {
  await assertManagedRunStateFile(path);
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') { await assertManagedRunStateFile(path); return false; }
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

function workflowStart(workflowDoc, workflowPath) {
  const start = workflowDoc?.start;
  if (typeof start !== 'string' || start.length === 0) throw new Error(`workflow missing string start: ${workflowPath}`);
  return start;
}

export async function ensureRunFiles(paths, { userPrompt, userPromptTarget } = {}) {
  await mkdir(paths.runsRoot, { recursive: true });
  await mkdir(paths.runDir, { recursive: true });
  await mkdir(paths.runnerDir, { recursive: true });
  await mkdir(paths.instructionsDir, { recursive: true });

  const batonExists = await exists(paths.batonPath);
  if (batonExists) await assertManagedRunStateFile(paths.batonPath, 'workflow baton');
  if (!batonExists) {
    const workflowDoc = await readJson(paths.workflowPath, 'workflow');
    const start = workflowStart(workflowDoc, paths.workflowPath);
    const initialBaton = { cursor: start, status: 'running', state: { artifacts: [], results: [] } };
    if (typeof userPrompt === 'string') {
      initialBaton.user_prompt = userPrompt;
      if (typeof userPromptTarget === 'string') initialBaton.user_prompt_target = userPromptTarget;
    }
    await writeFile(paths.batonPath, `${JSON.stringify(initialBaton, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }

  await createFileIfMissing(paths.historyPath, '');
  return { initialized: !batonExists, resumed: batonExists };
}
