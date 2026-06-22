import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertManagedRunStateFile } from './atomic-file.mjs';
import {
  PERSISTED_RUN_STATE_TOPOLOGY,
  PERSISTED_RUN_STATE_VERSION,
  assertPendingCommitInstructionRefs,
  assertPersistedRunState,
  commitMetadata,
} from './persisted-state-schema.mjs';

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function readJsonIfExists(path, name) {
  await assertManagedRunStateFile(path, name);
  if (!(await exists(path))) return undefined;
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`cannot read ${name} from ${path}: ${error.message}`); }
  try { return JSON.parse(content); }
  catch (error) { throw new Error(`cannot parse ${name} from ${path}: ${error.message}`); }
}

async function readTextIfExists(path, name, { required = false } = {}) {
  await assertManagedRunStateFile(path, name);
  if (!(await exists(path))) {
    if (required) throw new Error(`cannot read ${name} from ${path}: missing committed instruction file`);
    return undefined;
  }
  try { return await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`cannot read ${name} from ${path}: ${error.message}`); }
}


export async function readPersistedRunState(paths) {
  const baton = await readJsonIfExists(paths.batonPath, 'baton');
  if (baton === undefined) throw new Error(`cannot read persisted run state: missing baton at ${paths.batonPath}`);
  const historyText = await readTextIfExists(paths.historyPath, 'workflow history');
  const pendingCommit = await readJsonIfExists(paths.durableCommitPath, 'pending durable workflow commit');
  assertPendingCommitInstructionRefs(paths, pendingCommit);
  const pendingInstructions = (pendingCommit?.instructions ?? []).map((instruction) => ({
    id: instruction.id,
    stepId: instruction.stepId,
    path: resolve(instruction.path),
    action: instruction.action,
    status: instruction.status ?? 'pending',
  }));
  const instructions = pendingInstructions;
  return assertPersistedRunState({
    version: PERSISTED_RUN_STATE_VERSION,
    storageTopology: PERSISTED_RUN_STATE_TOPOLOGY,
    run: { runDir: paths.runDir, workflowPath: paths.workflowPath, repositoryRoot: paths.repositoryRoot },
    baton,
    instructions,
    history: historyText === undefined
      ? { mode: 'file-ref', path: paths.historyPath }
      : { mode: 'embedded-text', path: paths.historyPath, text: historyText },
    commit: commitMetadata(pendingCommit),
  });
}
