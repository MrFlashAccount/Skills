import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.WORKFLOW_RUNS_ROOT) {
  const runsRoot = mkdtempSync(join(tmpdir(), 'orbita-test-workflow-runs-'));
  process.env.WORKFLOW_RUNS_ROOT = runsRoot;

  process.once('exit', () => {
    rmSync(runsRoot, { recursive: true, force: true });
  });
}
