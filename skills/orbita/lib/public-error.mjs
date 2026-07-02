/** Redacts private workflow-runner storage paths from public CLI/API error output. */
import { workflowRunsRoot } from './persistence/run-state/paths.mjs';

const PATH_TOKEN = /(?:^|[\s'"`(=])([^\s'"`)]+)/g;
const TRAILING_PUNCTUATION = /[,:;.!?]+$/;

function normalizeComparablePath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

function uniqueRoots(roots) {
  const seen = new Set();
  const result = [];
  for (const root of roots) {
    if (typeof root !== 'string' || root.length === 0) continue;
    const normalized = normalizeComparablePath(root);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ raw: root, normalized });
  }
  return result;
}

function privateRoots({ runsRoot } = {}) {
  return uniqueRoots([runsRoot, process.env.WORKFLOW_RUNS_ROOT, workflowRunsRoot]);
}

function relativePrivatePath(pathname, roots) {
  const normalizedPathname = normalizeComparablePath(pathname);
  for (const root of roots) {
    if (normalizedPathname === root.normalized) return '';
    if (normalizedPathname.startsWith(`${root.normalized}/`)) return normalizedPathname.slice(root.normalized.length + 1);
  }
  return undefined;
}

function replacementForPrivatePath(relativePath) {
  if (relativePath === 'runs.json' || relativePath === '.runs.json.lock') return 'workflow runs index';
  if (/^[^/]+\/history\.md$/.test(relativePath)) return 'workflow history private state';
  if (/^[^/]+\/baton\.json$/.test(relativePath)) return 'workflow baton private state';
  return 'workflow run private state';
}

function redactPathToken(token, roots) {
  const trailing = token.match(TRAILING_PUNCTUATION)?.[0] ?? '';
  const pathname = trailing ? token.slice(0, -trailing.length) : token;
  const relativePath = relativePrivatePath(pathname, roots);
  if (relativePath === undefined) return token;
  return `${replacementForPrivatePath(relativePath)}${trailing}`;
}

export function publicErrorMessage(message, options = {}) {
  const roots = privateRoots(options);
  return String(message).replaceAll(PATH_TOKEN, (match, token) => {
    const prefixLength = match.length - token.length;
    return `${match.slice(0, prefixLength)}${redactPathToken(token, roots)}`;
  });
}
