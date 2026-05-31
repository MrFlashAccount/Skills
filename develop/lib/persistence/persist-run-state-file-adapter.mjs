import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { assertBatonSchema, assertResponseSchema } from '../workflow/schema-validation.mjs';

async function readJsonFile(path, name) {
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

async function assertManagedFileIsNotSymlink(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`refusing to use symlinked run-state file: ${path}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function assertRunDirIsDirectory(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`refusing to use symlinked run dir: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function writeFileAtomic(path, content) {
  await assertManagedFileIsNotSymlink(path);
  const dir = dirname(path);
  const tempPath = join(dir, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  let renamed = false;

  try {
    await handle.writeFile(content, 'utf8');
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

async function appendFileDurably(path, content) {
  await assertManagedFileIsNotSymlink(path);
  const handle = await open(path, 'a', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertInputSchema(kind, value) {
  if (kind === 'response') assertResponseSchema(value);
  else assertBatonSchema(value);
}

/** Task-shaped filesystem adapter for persist-run-state CLI input/output DTOs. */
export class PersistRunStateFileAdapter {
  async readInput({ responsePath, batonPath }) {
    const kind = responsePath ? 'response' : 'baton';
    const source = responsePath ?? batonPath;
    const name = responsePath ? 'workflow interpreter response' : 'baton';
    const value = await readJsonFile(source, name);
    assertInputSchema(kind, value);
    return { kind, source, value };
  }

  async persistRunState({ runDir, baton, historyEntry }) {
    await assertRunDirIsDirectory(runDir);
    await mkdir(runDir, { recursive: true });

    const batonPath = join(runDir, 'baton.json');
    const historyPath = join(runDir, 'history.md');

    await writeFileAtomic(batonPath, `${JSON.stringify(baton, null, 2)}\n`);
    await appendFileDurably(historyPath, historyEntry);

    return { baton: batonPath, history: historyPath };
  }
}
