import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function lifecycleRoot(runsRoot) {
  if (!runsRoot) throw new Error('runsRoot is required');
  return join(runsRoot, 'orbita-lifecycle');
}

function runPath(root, runId) {
  if (!runId || /[/\\]/.test(runId)) throw new Error('valid runId is required');
  return join(root, `${runId}.json`);
}

function corruptDiagnostic(name, error) {
  return {
    level: 'warning',
    code: 'corrupt_run_record_skipped',
    file: name,
    message: error instanceof SyntaxError ? 'invalid_json' : 'unreadable_run_record',
  };
}

export function createFileOrbitaRunStore({ runsRoot } = {}) {
  const root = lifecycleRoot(runsRoot);
  let lastDiagnostics = [];

  return {
    root,
    diagnostics() {
      return lastDiagnostics.length > 0 ? [...lastDiagnostics] : undefined;
    },
    async save(run) {
      if (!run?.run_id) throw new Error('run.run_id is required');
      await mkdir(root, { recursive: true, mode: 0o700 });
      const target = runPath(root, run.run_id);
      const tmp = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
      await writeFile(tmp, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
      await rename(tmp, target);
      return run;
    },
    async get(runId) {
      lastDiagnostics = [];
      try {
        return JSON.parse(await readFile(runPath(root, runId), 'utf8'));
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        lastDiagnostics = [corruptDiagnostic(`${runId}.json`, error)];
        return null;
      }
    },
    async list() {
      lastDiagnostics = [];
      try {
        const names = (await readdir(root)).filter((name) => name.endsWith('.json')).sort();
        const runs = [];
        for (const name of names) {
          try {
            runs.push(JSON.parse(await readFile(join(root, name), 'utf8')));
          } catch (error) {
            lastDiagnostics.push(corruptDiagnostic(name, error));
          }
        }
        return runs.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
      }
    },
  };
}
