/** Redacts private workflow-runner storage paths from public CLI error output. */
const WORKFLOW_RUNS_PATH = /(?:^|[\s'"`(=])([^\s'"`)]*\.workflow-runs(?:\/(?:runs\.json|\.runs\.json\.lock|[A-Za-z0-9_.-]+(?:\/[^\s'"`)]*)?))?)/g;

function replacementForPrivatePath(match, pathname) {
  const prefixLength = match.length - pathname.length;
  const prefix = match.slice(0, prefixLength);
  if (/\.workflow-runs\/(?:runs\.json|\.runs\.json\.lock)$/.test(pathname)) return `${prefix}workflow runs index`;
  if (/\.workflow-runs\/[^/]+\/history\.md$/.test(pathname)) return `${prefix}workflow history private state`;
  if (/\.workflow-runs\/[^/]+\/baton\.json$/.test(pathname)) return `${prefix}workflow baton private state`;
  return `${prefix}workflow run private state`;
}

export function publicErrorMessage(message) {
  return String(message).replaceAll(WORKFLOW_RUNS_PATH, replacementForPrivatePath);
}
