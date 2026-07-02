import { RunsRootObserverReader } from '../../dashboard/server/runs-root-observer-reader.mjs';
import { startDashboardServer } from '../../dashboard/server/dashboard-server.mjs';
import { publicErrorMessage } from '../../public-error.mjs';

async function publicDashboardApiCall(callback, { runsRoot } = {}) {
  try { return await callback(); }
  catch (error) {
    const redacted = new Error(publicErrorMessage(error?.message ?? String(error), { runsRoot }));
    if (error?.code) redacted.code = error.code;
    throw redacted;
  }
}

export async function listDashboardRuns({ runsRoot, now } = {}) {
  return publicDashboardApiCall(
    () => new RunsRootObserverReader({ runsRoot, now }).listRuns(),
    { runsRoot },
  );
}

export async function getDashboardRun({ runsRoot, runId, now } = {}) {
  return publicDashboardApiCall(
    () => new RunsRootObserverReader({ runsRoot, now }).getRun(runId),
    { runsRoot },
  );
}

export { startDashboardServer };
