import { resolve } from 'node:path';
import { isInside } from '../filesystem/path-safety.mjs';
import { assertBatonSchema } from '../../entities/Baton/schema/baton-schema.mjs';

export const PERSISTED_RUN_STATE_VERSION = 1;
export const PERSISTED_RUN_STATE_TOPOLOGY = 'split-files-v1';

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
}

function assertCommitSchema(commit) {
  if (commit === undefined) return;
  assertObject(commit, 'persisted run-state commit');
  if (commit.version !== 1) throw new Error('persisted run-state commit has unsupported version');
  assertString(commit.id, 'persisted run-state commit id');
  assertString(commit.createdAt, 'persisted run-state commit createdAt');
  if (!['pending', 'applying', 'applied'].includes(commit.status)) throw new Error('persisted run-state commit status is invalid');
  assertObject(commit.sideEffects, 'persisted run-state commit sideEffects');
}

export function assertPendingCommitInstructionRefs(paths, pendingCommit) {
  if (pendingCommit === undefined) return;
  if (pendingCommit.instructions === undefined) return;
  if (!Array.isArray(pendingCommit.instructions)) throw new Error('pending durable workflow commit instructions must be an array');
  const instructionsDir = resolve(paths.instructionsDir);
  for (const [index, instruction] of pendingCommit.instructions.entries()) {
    assertObject(instruction, `pending durable workflow commit instructions[${index}]`);
    assertString(instruction.path, `pending durable workflow commit instructions[${index}].path`);
    const instructionPath = resolve(instruction.path);
    if (!isInside(instructionPath, instructionsDir)) {
      throw new Error(`pending durable workflow commit instruction path escapes instructions dir: ${instruction.path}`);
    }
  }
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
  assertObject(state.history, `${name} history`);
  if (state.history.mode !== 'file-ref' && state.history.mode !== 'embedded-text') throw new Error(`${name} history mode is invalid`);
  if (state.history.mode === 'file-ref') assertString(state.history.path, `${name} history.path`);
  if (state.history.mode === 'embedded-text' && typeof state.history.text !== 'string') throw new Error(`${name} history.text must be a string`);
  if (!Array.isArray(state.instructions)) throw new Error(`${name} instructions must be an array`);
  for (const [index, instruction] of state.instructions.entries()) {
    assertObject(instruction, `${name} instructions[${index}]`);
    assertString(instruction.path, `${name} instructions[${index}].path`);
    if ('content' in instruction && typeof instruction.content !== 'string') throw new Error(`${name} instructions[${index}].content must be a string`);
    if (instruction.required === true && !('content' in instruction)) throw new Error(`${name} instructions[${index}].content must be present for committed instruction`);
  }
  assertCommitSchema(state.commit);
  return state;
}

export function commitMetadata(commit) {
  if (!commit) return undefined;
  const sideEffects = {
    baton: Object.hasOwn(commit, 'baton'),
    history: typeof commit.historyText === 'string',
    instructions: Array.isArray(commit.instructions) ? commit.instructions.length : 0,
  };
  return {
    version: 1,
    id: commit.id,
    createdAt: commit.createdAt,
    status: commit.status ?? 'pending',
    sideEffects,
  };
}

export function projectRuntimeRunState(persisted) {
  assertPersistedRunState(persisted);
  return {
    baton: structuredClone(persisted.baton),
    instructions: structuredClone(persisted.instructions),
    history: structuredClone(persisted.history),
  };
}
