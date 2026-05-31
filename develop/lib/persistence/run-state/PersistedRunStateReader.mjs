import { constants } from 'node:fs';
import { access, lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertBatonSchema, assertRunnerHostResponseSchema } from '../../schemas/workflow-schema.mjs';

export const PERSISTED_RUN_STATE_VERSION = 1;
export const PERSISTED_RUN_STATE_TOPOLOGY = 'split-files-v1';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function assertManagedRunStateFile(path, name = 'workflow run-state file') {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`${name} is unsafe because it is a symlink: ${path}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function readJsonIfExists(path, name) {
  await assertManagedRunStateFile(path, name);
  if (!(await exists(path))) return undefined;
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

async function readTextIfExists(path, name) {
  await assertManagedRunStateFile(path, name);
  if (!(await exists(path))) return undefined;
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${name} from ${path}: ${error.message}`);
  }
}

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
}

function assertPersistedLastResponse(response) {
  assertRunnerHostResponseSchema(response);
}

function assertCommitSchema(commit) {
  if (commit === undefined) return;
  assertObject(commit, 'persisted run-state commit');
  if (commit.version !== 1) throw new Error('persisted run-state commit has unsupported version');
  assertString(commit.createdAt, 'persisted run-state commit createdAt');
  if (!['pending', 'applying', 'applied'].includes(commit.status)) throw new Error('persisted run-state commit status is invalid');
  assertObject(commit.sideEffects, 'persisted run-state commit sideEffects');
}

export function assertPersistedRunState(state, name = 'persisted run state') {
  assertObject(state, name);
  if (state.version !== PERSISTED_RUN_STATE_VERSION) throw new Error(`${name} has unsupported version`);
  if (state.storageTopology !== PERSISTED_RUN_STATE_TOPOLOGY) throw new Error(`${name} has unsupported storage topology`);
  assertObject(state.run, `${name} run`);
  assertString(state.run.runDir, `${name} run.runDir`);
  assertString(state.run.workflowPath, `${name} run.workflowPath`);
  assertString(state.run.repositoryRoot, `${name} run.repositoryRoot`);
  assertBatonSchema(state.baton);
  if (state.lastResponse !== undefined) assertPersistedLastResponse(state.lastResponse);
  assertObject(state.history, `${name} history`);
  if (state.history.mode !== 'file-ref' && state.history.mode !== 'embedded-text') throw new Error(`${name} history mode is invalid`);
  if (state.history.mode === 'file-ref') assertString(state.history.path, `${name} history.path`);
  if (state.history.mode === 'embedded-text' && typeof state.history.text !== 'string') throw new Error(`${name} history.text must be a string`);
  if (!Array.isArray(state.instructions)) throw new Error(`${name} instructions must be an array`);
  for (const [index, instruction] of state.instructions.entries()) {
    assertObject(instruction, `${name} instructions[${index}]`);
    assertString(instruction.path, `${name} instructions[${index}].path`);
  }
  assertCommitSchema(state.commit);
  return state;
}

function commitMetadata(commit) {
  if (!commit) return undefined;
  const sideEffects = {
    baton: Object.hasOwn(commit, 'baton'),
    lastResponse: Object.hasOwn(commit, 'response'),
    history: typeof commit.historyText === 'string',
    instructions: Array.isArray(commit.instructions) ? commit.instructions.length : 0,
  };
  return {
    version: 1,
    id: commit.id ?? commit.createdAt,
    createdAt: commit.createdAt,
    status: commit.status ?? 'pending',
    sideEffects,
  };
}

export async function readPersistedRunState(paths) {
  const baton = await readJsonIfExists(paths.batonPath, 'baton');
  if (baton === undefined) throw new Error(`cannot read persisted run state: missing baton at ${paths.batonPath}`);
  const lastResponse = await readJsonIfExists(paths.lastResponsePath, 'last runner response');
  const historyText = await readTextIfExists(paths.historyPath, 'workflow history');
  const pendingCommit = await readJsonIfExists(paths.durableCommitPath, 'pending durable workflow commit');
  const instructions = (pendingCommit?.instructions ?? []).map((instruction) => ({
    id: instruction.id,
    stepId: instruction.stepId,
    path: resolve(instruction.path),
    action: instruction.action,
    status: instruction.status,
  }));
  return assertPersistedRunState({
    version: PERSISTED_RUN_STATE_VERSION,
    storageTopology: PERSISTED_RUN_STATE_TOPOLOGY,
    run: {
      runDir: paths.runDir,
      workflowPath: paths.workflowPath,
      repositoryRoot: paths.repositoryRoot,
    },
    baton,
    lastResponse,
    instructions,
    history: historyText === undefined
      ? { mode: 'file-ref', path: paths.historyPath }
      : { mode: 'embedded-text', path: paths.historyPath, text: historyText },
    commit: commitMetadata(pendingCommit),
  });
}

export function projectRuntimeRunState(persisted) {
  assertPersistedRunState(persisted);
  return {
    baton: structuredClone(persisted.baton),
    lastResponse: persisted.lastResponse === undefined ? undefined : structuredClone(persisted.lastResponse),
    instructions: structuredClone(persisted.instructions),
    history: structuredClone(persisted.history),
  };
}
