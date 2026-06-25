import { constants } from 'node:fs';
import { access, open, readFile, rm } from 'node:fs/promises';
import { assertPersistedRunState } from './persisted-state-schema.mjs';
import { readPersistedRunState } from './PersistedRunStateReader.mjs';
import { assertManagedRunStateFile, writeJsonAtomic, writeTextAtomic } from './atomic-file.mjs';

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

async function snapshotDurableTargets(paths) {
  return {
    history: await readTextIfExists(paths.historyPath),
    baton: await readTextIfExists(paths.batonPath),
  };
}

async function restoreDurableTargets(paths, snapshot) {
  await restoreTextSnapshot(paths.historyPath, snapshot.history);
  await restoreTextSnapshot(paths.batonPath, snapshot.baton);
}

export async function recoverDurableCommit(paths) {
  if (!(await exists(paths.durableCommitPath))) return false;
  await assertManagedRunStateFile(paths.durableCommitPath, 'pending durable workflow commit');
  const commit = await readJson(paths.durableCommitPath, 'pending durable workflow commit');
  if (commit?.version !== 1) throw new Error(`unsupported durable workflow commit version in ${paths.durableCommitPath}`);

  const before = await snapshotDurableTargets(paths);
  try {
    await writeJsonAtomic(paths.durableCommitPath, { ...commit, status: 'applying' });
    if (typeof commit.historyText === 'string') await writeTextAtomic(paths.historyPath, commit.historyText);
    maybeFailDurableCommitAfter('history');
    if (Object.hasOwn(commit, 'baton')) await writeJsonAtomic(paths.batonPath, commit.baton);
    maybeFailDurableCommitAfter('baton');
    await rm(paths.durableCommitPath, { force: true });
    assertPersistedRunState(await readPersistedRunState(paths), 'persisted run state after recovery');
    return true;
  } catch (error) {
    await restoreDurableTargets(paths, before);
    throw error;
  }
}

function nextPersistedRunState(current, { baton, historyText, writeBaton = true }, commit) {
  return {
    ...current,
    baton: writeBaton ? baton : current.baton,
    instructions: [],
    history: { mode: 'embedded-text', path: current.history.path, text: historyText },
    commit: { version: 1, id: commit.id, createdAt: commit.createdAt, status: 'pending', sideEffects: { baton: writeBaton, history: true } },
  };
}

export async function commitDurableRunState(paths, { baton, history, writeBaton = true }) {
  await recoverDurableCommit(paths);
  const current = await readPersistedRunState(paths);
  const historyBefore = current.history.mode === 'embedded-text' ? current.history.text : (await readTextIfExists(paths.historyPath)).content;
  const historyText = `${historyBefore ?? ''}${historyEntry(history)}`;
  const commit = {
    version: 1,
    id: `${Date.now()}-${process.pid}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    historyText,
    sideEffects: { baton: writeBaton, history: true },
  };
  if (writeBaton) commit.baton = baton;
  assertPersistedRunState(nextPersistedRunState(current, { baton, historyText, writeBaton }, commit), 'next persisted run state');
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
