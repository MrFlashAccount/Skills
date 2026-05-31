import { constants } from 'node:fs';
import { access, lstat, open, readFile, realpath, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertPersistedRunState } from './persisted-state-schema.mjs';
import { readPersistedRunState } from './PersistedRunStateReader.mjs';
import { assertManagedRunStateFile, writeJsonAtomic, writeTextAtomic } from './atomic-file.mjs';
import { isInside } from '../path-utils.mjs';

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }

async function readJson(path, name) {
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`cannot read ${name} from ${path}: ${error.message}`); }
  try { return JSON.parse(content); }
  catch (error) { throw new Error(`cannot parse ${name} from ${path}: ${error.message}`); }
}

function historyEntry({ source, baton, requests, steps, output, decision }) {
  const lines = [`## ${new Date().toISOString()}`, '', `- source: ${source}`, `- baton: cursor=${baton.cursor ?? 'unknown'} status=${baton.status ?? 'unknown'}`];
  if (steps?.length) lines.push(`- steps: ${steps.map((step) => `id=${step.id} action=${step.action}`).join('; ')}`);
  else if (requests?.length) lines.push(`- requests: ${requests.map((request) => `id=${request.id} action=${request.action}`).join('; ')}`);
  if (output) lines.push(`- output: ${output}`);
  if (decision) lines.push(`- decision: ${decision}`);
  if (baton.blocker) lines.push(`- blocker: ${JSON.stringify(baton.blocker).replace(/\s+/g, ' ').trim()}`);
  lines.push('', '');
  return lines.join('\n');
}

function maybeFailDurableCommitAfter(action) {
  if (process.env.WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER === action) throw new Error(`injected durable commit failure after ${action}`);
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
    try { if ((await lstat(targetPath)).isSymbolicLink()) throw new Error(`durable workflow commit instruction path escapes instructions dir: ${instruction.path}`); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const existingParent = await nearestExistingParent(dirname(targetPath));
    const existingParentRealpath = await realpath(existingParent);
    if (!isInside(existingParentRealpath, instructionsDirRealpath)) throw new Error(`durable workflow commit instruction path escapes instructions dir: ${instruction.path}`);
  }
}

async function readTextIfExists(path) {
  try {
    await assertManagedRunStateFile(path);
    return { exists: true, content: await readFile(path, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, content: undefined };
    throw error;
  }
}

async function restoreTextSnapshot(path, snapshot) {
  await assertManagedRunStateFile(path);
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
  await assertManagedRunStateFile(paths.durableCommitPath, 'pending durable workflow commit');
  const commit = await readJson(paths.durableCommitPath, 'pending durable workflow commit');
  if (commit?.version !== 1) throw new Error(`unsupported durable workflow commit version in ${paths.durableCommitPath}`);
  await validateInstructionCommit(paths, commit.instructions);

  const before = await snapshotDurableTargets(paths, commit.instructions);
  try {
    await writeJsonAtomic(paths.durableCommitPath, { ...commit, status: 'applying' });
    await writeInstructionFiles(commit.instructions);
    maybeFailDurableCommitAfter('instructions');
    if (typeof commit.historyText === 'string') await writeTextAtomic(paths.historyPath, commit.historyText);
    maybeFailDurableCommitAfter('history');
    if (Object.hasOwn(commit, 'baton')) await writeJsonAtomic(paths.batonPath, commit.baton);
    maybeFailDurableCommitAfter('baton');
    if (Object.hasOwn(commit, 'response')) {
      await writeJsonAtomic(paths.lastResponsePath, commit.response);
      maybeFailDurableCommitAfter('last-response');
    }
    await rm(paths.durableCommitPath, { force: true });
    assertPersistedRunState(await readPersistedRunState(paths), 'persisted run state after recovery');
    return true;
  } catch (error) {
    await restoreDurableTargets(paths, before);
    throw error;
  }
}

function nextPersistedRunState(current, { response, baton, instructions = [], historyText, writeBaton = true }, commit) {
  return {
    ...current,
    baton: writeBaton ? baton : current.baton,
    ...(response === undefined ? {} : { lastResponse: response }),
    instructions: instructions.map((instruction) => ({ path: instruction.path, stepId: instruction.stepId, action: instruction.action, status: instruction.status ?? 'pending' })),
    history: { mode: 'embedded-text', path: current.history.path, text: historyText },
    commit: { version: 1, id: commit.id, createdAt: commit.createdAt, status: 'pending', sideEffects: { baton: writeBaton, lastResponse: response !== undefined, history: true, instructions: instructions.length } },
  };
}

export async function commitDurableRunState(paths, { response, baton, instructions = [], history, writeBaton = true }) {
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const historyBefore = current.history.mode === 'embedded-text' ? current.history.text : (await readTextIfExists(paths.historyPath)).content;
  const historyText = `${historyBefore ?? ''}${historyEntry(history)}`;
  const commit = {
    version: 1,
    id: `${Date.now()}-${process.pid}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...(response === undefined ? {} : { response }),
    instructions,
    historyText,
    sideEffects: { baton: writeBaton, lastResponse: response !== undefined, history: true, instructions: instructions.length },
  };
  if (writeBaton) commit.baton = baton;
  await validateInstructionCommit(paths, instructions);
  assertPersistedRunState(nextPersistedRunState(current, { response, baton, instructions, historyText, writeBaton }, commit), 'next persisted run state');
  await writeJsonAtomic(paths.durableCommitPath, commit);
  maybeFailDurableCommitAfter('pending');
  await recoverDurableCommit(paths);
  assertPersistedRunState(await readPersistedRunState(paths), 'persisted run state after write');
}

export async function appendHistory(paths, entry) {
  await assertManagedRunStateFile(paths.historyPath, 'workflow history');
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
