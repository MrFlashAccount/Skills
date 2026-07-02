import { readRunsIndex, runsIndexPathsForRoot } from '../../persistence/run-state/run-index.mjs';
import { resolveRunPaths, workflowRunsRoot } from '../../persistence/run-state/paths.mjs';
import { readPersistedRunState } from '../../persistence/run-state/PersistedRunStateReader.mjs';
import { projectDashboardRun } from '../projection/safe-dashboard-projection.mjs';

function sortByUpdatedAtDesc(left, right) {
  return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')) || left.runId.localeCompare(right.runId);
}

function degradedFromError(error) {
  return {
    reason: 'read_failed',
    message: error?.message ? String(error.message).replace(/\s+from\s+.*$/, '') : 'run state could not be read',
  };
}

export class RunsRootObserverReader {
  constructor({ runsRoot = workflowRunsRoot, now = () => new Date() } = {}) {
    this.runsRoot = runsRoot;
    this.now = now;
  }

  async readIndex() {
    return readRunsIndex(runsIndexPathsForRoot(this.runsRoot));
  }

  async readRunEntry(entry, { includeDetail = false } = {}) {
    try {
      const paths = resolveRunPaths({
        runId: entry.runId,
        workflowPath: entry.workflow?.path,
        runsRoot: this.runsRoot,
      });
      const persistedState = await readPersistedRunState(paths);
      return projectDashboardRun({ run: entry, persistedState }, { now: this.now(), includeDetail });
    } catch (error) {
      return projectDashboardRun({
        run: entry,
        degraded: degradedFromError(error),
      }, { now: this.now(), includeDetail });
    }
  }

  async listRuns() {
    const index = await this.readIndex();
    const entries = Object.values(index.runs).sort(sortByUpdatedAtDesc);
    return Promise.all(entries.map((entry) => this.readRunEntry(entry)));
  }

  async getRun(runId) {
    const index = await this.readIndex();
    const entry = index.runs[runId];
    if (!entry) return undefined;
    return this.readRunEntry(entry, { includeDetail: true });
  }
}
