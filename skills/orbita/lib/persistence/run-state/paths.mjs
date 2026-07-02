import { constants, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { access, cp, mkdir, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRepositoryRootForWorkflow } from '../workflow-resources/resource-resolver.mjs';
import { assertManagedRunStateFile, createManagedDirectory } from './atomic-file.mjs';
import { runsIndexPathsForRoot } from './run-index.mjs';

const runnerDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(runnerDir, '../../../../..');
export const defaultWorkflowPath = join(repositoryRoot, 'workflows/dev-harness/workflow.json');
export const legacyWorkflowRunsRoot = join(repositoryRoot, 'skills/orbita/.workflow-runs');
export const orbitaHome = resolve(process.env.ORBITA_HOME ?? join(homedir(), '.orbita'));
export const defaultWorkflowRunsRoot = join(orbitaHome, 'workflow-runs/v1');

const TEST_RUN_ID_RE = /^(workflow-runner-test-|workflow-runner-reuse-hints-|workflow-runner-fairness-|persisted-state-test-|workflow-e2e-|binding-)/;

function isNodeTestRunner() {
  if (typeof process.env.NODE_TEST_CONTEXT !== 'string' || process.env.NODE_TEST_CONTEXT.length === 0) return false;
  const entryPoint = process.argv[1] ?? '';
  return entryPoint.endsWith('.test.mjs') || entryPoint.includes('/lib/tests/');
}

function testRunIdsInRoot(runsRoot) {
  const testRunIds = new Set();
  try {
    for (const runId of readdirSync(runsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && TEST_RUN_ID_RE.test(entry.name))
      .map((entry) => entry.name)) {
      testRunIds.add(runId);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return testRunIds;
    throw error;
  }

  const indexPath = join(runsRoot, 'runs.json');
  if (!existsSync(indexPath)) return testRunIds;
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    for (const runId of Object.keys(index.runs ?? {})) {
      if (TEST_RUN_ID_RE.test(runId)) testRunIds.add(runId);
    }
  } catch {
    // Cleanup should not mask the underlying test failure for a corrupt index.
  }
  return testRunIds;
}

function cleanupNewTestRuns(runsRoot, baselineTestRunIds) {
  let currentTestRunIds;
  try {
    currentTestRunIds = testRunIdsInRoot(runsRoot);
  } catch (error) {
    console.error(`workflow runs test cleanup failed while reading ${runsRoot}: ${error.message}`);
    return;
  }

  for (const runId of currentTestRunIds) {
    if (baselineTestRunIds.has(runId)) continue;
    rmSync(join(runsRoot, runId), { recursive: true, force: true });
  }

  const indexPath = join(runsRoot, 'runs.json');
  if (!existsSync(indexPath)) return;
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    let changed = false;
    for (const runId of Object.keys(index.runs ?? {})) {
      if (!TEST_RUN_ID_RE.test(runId) || baselineTestRunIds.has(runId)) continue;
      delete index.runs[runId];
      changed = true;
    }
    if (changed) {
      const tmpIndexPath = join(runsRoot, `.runs.json.cleanup-${process.pid}.tmp`);
      writeFileSync(tmpIndexPath, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmpIndexPath, indexPath);
    }
  } catch (error) {
    console.error(`workflow runs test cleanup failed for ${indexPath}: ${error.message}`);
  }
}

function configureWorkflowRunsRoot() {
  if (!isNodeTestRunner()) return process.env.WORKFLOW_RUNS_ROOT ?? defaultWorkflowRunsRoot;
  if (!process.env.WORKFLOW_RUNS_ROOT) {
    const testRunsRoot = mkdtempSync(join(tmpdir(), 'orbita-test-workflow-runs-'));
    process.env.WORKFLOW_RUNS_ROOT = testRunsRoot;
    process.once('exit', () => rmSync(testRunsRoot, { recursive: true, force: true }));
    return testRunsRoot;
  }

  const explicitRunsRoot = resolve(process.env.WORKFLOW_RUNS_ROOT);
  const baselineTestRunIds = testRunIdsInRoot(explicitRunsRoot);
  process.once('exit', () => cleanupNewTestRuns(explicitRunsRoot, baselineTestRunIds));
  return explicitRunsRoot;
}

export const workflowRunsRoot = resolve(configureWorkflowRunsRoot());

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

export function runDirForRunId(runId, runsRoot = workflowRunsRoot) {
  assertSafeRunId(runId);
  return join(runsRoot, runId);
}

export function resolveRunPaths({ runId, workflowPath, runsRoot = workflowRunsRoot }) {
  const safeRunId = assertSafeRunId(runId);
  const indexPaths = runsIndexPathsForRoot(runsRoot);
  const resolvedRunDir = runDirForRunId(safeRunId, indexPaths.runsRoot);
  const resolvedWorkflowPath = resolve(workflowPath ?? defaultWorkflowPath);
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
    authorityPath: join(resolvedRunDir, '.workflow-runner', 'authority.json'),
    instructionsDir: join(resolvedRunDir, '.workflow-runner', 'instructions'),
    continueLockPath: join(resolvedRunDir, '.workflow-runner', 'continue.lock'),
    durableCommitPath: join(resolvedRunDir, '.workflow-runner', 'durable-commit.json'),
  };
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

export async function pathExists(path) { return exists(path); }

async function directoryEntries(path) {
  try { return await readdir(path); }
  catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function isDirectoryEmptyOrMissing(path) {
  return (await directoryEntries(path)).length === 0;
}

export async function migrateLegacyWorkflowRunsRootIfNeeded(runsRoot = workflowRunsRoot) {
  if (process.env.WORKFLOW_RUNS_ROOT) return false;
  if (resolve(runsRoot) !== workflowRunsRoot) return false;
  if (!(await exists(legacyWorkflowRunsRoot))) return false;
  if (!(await isDirectoryEmptyOrMissing(workflowRunsRoot))) {
    throw new Error('legacy skill-local workflow runs exist, but the default Orbita workflow runs root is not empty; set WORKFLOW_RUNS_ROOT to the legacy root or migrate the runs manually');
  }

  await createManagedDirectory(dirname(workflowRunsRoot), 'Orbita workflow runs parent directory');
  try {
    await rename(legacyWorkflowRunsRoot, workflowRunsRoot);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await cp(legacyWorkflowRunsRoot, workflowRunsRoot, { recursive: true, errorOnExist: true });
    await rm(legacyWorkflowRunsRoot, { recursive: true, force: true });
  }
  await createManagedDirectory(workflowRunsRoot, 'workflow runs root');
  return true;
}

async function readJson(path, name) {
  const { readFile } = await import('node:fs/promises');
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch (error) {
    const code = typeof error?.code === 'string' ? `: ${error.code}` : '';
    throw new Error(`cannot read ${name}${code}`);
  }
  try { return JSON.parse(content); }
  catch (error) { throw new Error(`cannot parse ${name}: ${error.message}`); }
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
  if (typeof start !== 'string' || start.length === 0) throw new Error('workflow missing string start');
  return start;
}

export async function ensureRunFiles(paths, { userPrompt, userPromptTarget } = {}) {
  await createManagedDirectory(paths.runsRoot, 'workflow runs root');
  await createManagedDirectory(paths.runDir, 'workflow run directory');
  await createManagedDirectory(paths.runnerDir, 'workflow runner directory');
  await createManagedDirectory(paths.instructionsDir, 'workflow runner instructions directory');

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
