import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';


export async function assertManagedDirectory(path, name = 'workflow run-state directory') {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`${name} is unsafe because it is a symlink: ${path}`);
    if (!stats.isDirectory()) throw new Error(`${name} is unsafe because it is not a directory: ${path}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

export async function createManagedDirectory(path, name = 'workflow run-state directory') {
  await assertManagedDirectory(path, name);
  await mkdir(path, { recursive: true });
  await assertManagedDirectory(path, name);
}

export async function assertManagedRunStateFile(path, name = 'workflow run-state file') {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`${name} is unsafe because it is a symlink: ${path}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  await assertManagedRunStateFile(path);
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
    try { await handle.close(); } catch {}
    if (!renamed) await rm(tempPath, { force: true });
  }
}

export async function writeTextAtomic(path, value) {
  await assertManagedRunStateFile(path);
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
    try { await handle.close(); } catch {}
    if (!renamed) await rm(tempPath, { force: true });
  }
}

export async function readText(path, name) {
  try {
    await assertManagedRunStateFile(path, name);
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${name} from ${path}: ${error.message}`);
  }
}
