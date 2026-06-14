import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const repositoryWorkflowRunsRoot = path.join(repositoryRoot, 'develop/.workflow-runs');

export function assertIsolatedWorkflowRunsRoot(runsRoot) {
  assert.ok(runsRoot, 'test workflow runs root is required');
  assert.notEqual(path.resolve(runsRoot), repositoryWorkflowRunsRoot, 'tests must not use repo develop/.workflow-runs');
  assert.equal(path.resolve(runsRoot).startsWith(path.resolve(tmpdir()) + path.sep), true, 'test workflow runs root must be under OS temp');
  return runsRoot;
}

export async function makeTempWorkflowRunsRoot(prefix = 'workflow-runs-test-') {
  const tempRoot = await mkdtemp(path.join(tmpdir(), prefix));
  return {
    tempRoot,
    runsRoot: assertIsolatedWorkflowRunsRoot(path.join(tempRoot, '.workflow-runs')),
    cleanup() {
      rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

export function cleanupWorkflowRunsRoot(tempRoot) {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
}
