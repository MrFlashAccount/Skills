import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(runnerDir, '../../..');
export const repositoryRoot = resolve(skillDir, '..');
export const defaultWorkflowPath = join(skillDir, 'dev-harness.workflow.json');

export function resolveRunPaths({ runDir, workflowPath }) {
  const resolvedRunDir = resolve(runDir);
  return {
    runDir: resolvedRunDir,
    workflowPath: resolve(workflowPath ?? defaultWorkflowPath),
    batonPath: join(resolvedRunDir, 'baton.json'),
    historyPath: join(resolvedRunDir, 'history.md'),
    outputsDir: join(resolvedRunDir, 'outputs'),
    runnerDir: join(resolvedRunDir, '.workflow-runner'),
    lastResponsePath: join(resolvedRunDir, '.workflow-runner', 'last-response.json'),
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

async function createFileIfMissing(path, content) {
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

function workflowStart(workflowDoc, workflowPath) {
  const start = workflowDoc?.workflow?.start;
  if (typeof start !== 'string' || start.length === 0) throw new Error(`workflow missing string workflow.start: ${workflowPath}`);
  return start;
}

export async function ensureRunFiles(paths) {
  await mkdir(paths.runDir, { recursive: true });
  await mkdir(paths.outputsDir, { recursive: true });
  await mkdir(paths.runnerDir, { recursive: true });

  const batonExists = await exists(paths.batonPath);
  if (!batonExists) {
    const workflowDoc = await readJson(paths.workflowPath, 'workflow');
    const initialBaton = {
      cursor: workflowStart(workflowDoc, paths.workflowPath),
      status: 'running',
      state: { artifacts: [], results: [] },
    };
    await writeFile(paths.batonPath, `${JSON.stringify(initialBaton, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }

  await createFileIfMissing(paths.historyPath, '');
  return { initialized: !batonExists, resumed: batonExists };
}

export async function pathExists(path) {
  return exists(path);
}

export async function writeJsonAtomic(path, value) {
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

export async function appendHistory(paths, { source, baton, requests, output }) {
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

  const handle = await open(paths.historyPath, 'a', 0o600);
  try {
    await handle.writeFile(lines.join('\n'), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function clearHostOutputPaths(requests = []) {
  for (const request of requests) {
    if (request?.outputPath) await rm(request.outputPath, { force: true });
  }
}

export async function persistRunnerResponse(paths, response) {
  await clearHostOutputPaths(response.requests);
  await writeJsonAtomic(paths.lastResponsePath, response);
  await appendHistory(paths, { source: 'workflow-runner', baton: response.baton, requests: response.requests });
}
