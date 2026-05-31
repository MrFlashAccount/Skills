import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startupUserPromptTarget } from '../user-prompt.mjs';
import { isInside } from '../path-utils.mjs';
import { defaultRepositoryRootForWorkflow } from '../resource-resolver.mjs';

const runnerDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(runnerDir, '../../../..');
export const defaultWorkflowPath = join(repositoryRoot, 'workflows/dev-harness/workflow.json');

export function resolveRunPaths({ runDir, workflowPath }) {
  const resolvedRunDir = resolve(runDir);
  const resolvedWorkflowPath = resolve(workflowPath ?? defaultWorkflowPath);
  return {
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
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path, name) {
  let content;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${name} from ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`cannot parse ${name} from ${path}: ${error.message}`);
  }
}

async function assertManagedFileIsNotSymlink(path, name = 'workflow run-state file') {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`${name} is unsafe because it is a symlink: ${path}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function createFileIfMissing(path, content) {
  await assertManagedFileIsNotSymlink(path);
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      await assertManagedFileIsNotSymlink(path);
      return false;
    }
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

export async function ensureRunFiles(paths, { userPrompt } = {}) {
  await mkdir(paths.runDir, { recursive: true });
  await mkdir(paths.runnerDir, { recursive: true });
  await mkdir(paths.instructionsDir, { recursive: true });

  const batonExists = await exists(paths.batonPath);
  if (batonExists) await assertManagedFileIsNotSymlink(paths.batonPath, 'workflow baton');
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
    await writeFile(paths.batonPath, `${JSON.stringify(initialBaton, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }

  await createFileIfMissing(paths.historyPath, '');
  return { initialized: !batonExists, resumed: batonExists };
}

export async function pathExists(path) {
  return exists(path);
}

export async function withContinueRunLock(paths, callback) {
  await mkdir(paths.runnerDir, { recursive: true });
  let handle;
  let acquired = false;
  try {
    handle = await open(paths.continueLockPath, 'wx', 0o600);
    acquired = true;
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`workflow-runner continue is already in progress for ${paths.runDir}; inspect or remove stale lock ${paths.continueLockPath}`);
    }
    if (acquired) await rm(paths.continueLockPath, { force: true });
    throw error;
  } finally {
    if (handle) await handle.close();
  }

  try {
    return await callback();
  } finally {
    await rm(paths.continueLockPath, { force: true });
  }
}

export async function writeJsonAtomic(path, value) {
  await assertManagedFileIsNotSymlink(path);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  let renamed = false;
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    await rename(tempPath, path);
    renamed = true;
  } finally {
    try {
      await handle.close();
    } catch {}
    if (!renamed) await rm(tempPath, { force: true });
  }
}

export async function writeTextAtomic(path, value) {
  await assertManagedFileIsNotSymlink(path);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  let renamed = false;
  try {
    await handle.writeFile(value, 'utf8');
    await handle.sync();
    await handle.close();
    await rename(tempPath, path);
    renamed = true;
  } finally {
    try {
      await handle.close();
    } catch {}
    if (!renamed) await rm(tempPath, { force: true });
  }
}

export async function readText(path, name) {
  try {
    await assertManagedFileIsNotSymlink(path, name);
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${name} from ${path}: ${error.message}`);
  }
}

function historyEntry({ source, baton, requests, output }) {
  const lines = [
    `## ${new Date().toISOString()}`,
    '',
    `- source: ${source}`,
    `- baton: cursor=${baton.cursor ?? 'unknown'} status=${baton.status ?? 'unknown'}`,
  ];
  if (requests?.length) lines.push(`- requests: ${requests.map((request) => `id=${request.id} action=${request.action}`).join('; ')}`);
  if (output) lines.push(`- output: ${output}`);
  if (baton.blocker) lines.push(`- blocker: ${JSON.stringify(baton.blocker).replace(/\s+/g, ' ').trim()}`);
  lines.push('', '');
  return lines.join('\n');
}

function maybeFailDurableCommitAfter(action) {
  if (process.env.WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER === action) {
    throw new Error(`injected durable commit failure after ${action}`);
  }
}

async function writeInstructionFiles(instructions) {
  for (const instruction of instructions ?? []) await writeTextAtomic(instruction.path, instruction.content);
}

async function nearestExistingParent(path) {
  let current = path;
  for (;;) {
    if (await exists(current)) return current;
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

async function validateInstructionCommit(paths, instructions) {
  const runnerDir = resolve(paths.runnerDir);
  const instructionsDir = resolve(paths.instructionsDir);
  if ((await lstat(runnerDir)).isSymbolicLink()) throw new Error(`durable workflow commit instructions dir is unsafe: ${paths.instructionsDir}`);
  if ((await lstat(instructionsDir)).isSymbolicLink()) throw new Error(`durable workflow commit instructions dir is unsafe: ${paths.instructionsDir}`);
  const runnerDirRealpath = await realpath(runnerDir);
  const instructionsDirRealpath = await realpath(instructionsDir);
  if (!isInside(instructionsDirRealpath, runnerDirRealpath)) throw new Error(`durable workflow commit instructions dir is unsafe: ${paths.instructionsDir}`);
  for (const instruction of instructions ?? []) {
    if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction)) throw new Error('invalid durable workflow commit instruction entry');
    if (typeof instruction.path !== 'string' || instruction.path.length === 0) throw new Error('invalid durable workflow commit instruction path');
    if (typeof instruction.content !== 'string') throw new Error('invalid durable workflow commit instruction content');
    const targetPath = resolve(instruction.path);
    if (!isInside(targetPath, instructionsDir)) throw new Error(`durable workflow commit instruction path escapes instructions dir: ${instruction.path}`);
    try {
      if ((await lstat(targetPath)).isSymbolicLink()) throw new Error(`durable workflow commit instruction path escapes instructions dir: ${instruction.path}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const existingParent = await nearestExistingParent(dirname(targetPath));
    const existingParentRealpath = await realpath(existingParent);
    if (!isInside(existingParentRealpath, instructionsDirRealpath)) throw new Error(`durable workflow commit instruction path escapes instructions dir: ${instruction.path}`);
  }
}

async function readTextIfExists(path) {
  try {
    await assertManagedFileIsNotSymlink(path);
    return { exists: true, content: await readFile(path, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, content: undefined };
    throw error;
  }
}

async function restoreTextSnapshot(path, snapshot) {
  await assertManagedFileIsNotSymlink(path);
  if (snapshot.exists) await writeTextAtomic(path, snapshot.content);
  else await rm(path, { force: true });
}

async function snapshotDurableTargets(paths, instructions) {
  const instructionSnapshots = new Map();
  for (const instruction of instructions ?? []) instructionSnapshots.set(instruction.path, await readTextIfExists(instruction.path));
  return {
    instructions: instructionSnapshots,
    history: await readTextIfExists(paths.historyPath),
    baton: await readTextIfExists(paths.batonPath),
    lastResponse: await readTextIfExists(paths.lastResponsePath),
  };
}

async function restoreDurableTargets(paths, snapshot) {
  for (const [instructionPath, instructionSnapshot] of snapshot.instructions.entries()) await restoreTextSnapshot(instructionPath, instructionSnapshot);
  await restoreTextSnapshot(paths.historyPath, snapshot.history);
  await restoreTextSnapshot(paths.batonPath, snapshot.baton);
  await restoreTextSnapshot(paths.lastResponsePath, snapshot.lastResponse);
}

export async function recoverDurableCommit(paths) {
  if (!(await exists(paths.durableCommitPath))) return false;
  await assertManagedFileIsNotSymlink(paths.durableCommitPath, 'pending durable workflow commit');
  const commit = await readJson(paths.durableCommitPath, 'pending durable workflow commit');
  if (commit?.version !== 1) throw new Error(`unsupported durable workflow commit version in ${paths.durableCommitPath}`);
  await validateInstructionCommit(paths, commit.instructions);

  const before = await snapshotDurableTargets(paths, commit.instructions);
  try {
    await writeInstructionFiles(commit.instructions);
    maybeFailDurableCommitAfter('instructions');
    if (typeof commit.historyText === 'string') await writeTextAtomic(paths.historyPath, commit.historyText);
    maybeFailDurableCommitAfter('history');
    if (Object.hasOwn(commit, 'baton')) await writeJsonAtomic(paths.batonPath, commit.baton);
    maybeFailDurableCommitAfter('baton');
    await writeJsonAtomic(paths.lastResponsePath, commit.response);
    maybeFailDurableCommitAfter('last-response');
    await rm(paths.durableCommitPath, { force: true });
    return true;
  } catch (error) {
    await restoreDurableTargets(paths, before);
    throw error;
  }
}

export async function commitDurableRunState(paths, { response, baton, instructions = [], history, writeBaton = true }) {
  const historyBefore = await readText(paths.historyPath, 'workflow history');
  const commit = {
    version: 1,
    createdAt: new Date().toISOString(),
    response,
    instructions,
    historyText: `${historyBefore}${historyEntry(history)}`,
  };
  if (writeBaton) commit.baton = baton;
  await writeJsonAtomic(paths.durableCommitPath, commit);
  maybeFailDurableCommitAfter('pending');
  await recoverDurableCommit(paths);
}

export async function appendHistory(paths, entry) {
  await assertManagedFileIsNotSymlink(paths.historyPath, 'workflow history');
  const handle = await open(paths.historyPath, 'a', 0o600);
  try {
    await handle.writeFile(historyEntry(entry), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function persistHostResponse(paths, response) {
  await writeJsonAtomic(paths.lastResponsePath, response);
  await appendHistory(paths, { source: 'workflow-runner', baton: response.baton, requests: response.requests });
}
