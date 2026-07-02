import { workflowRunsRoot } from '../persistence/run-state/paths.mjs';

const MAX_TEXT_LENGTH = 512;
const MAX_EVIDENCE_ITEMS = 5;
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

function redactPrivatePathToken(token, roots) {
  const trailing = token.match(TRAILING_PUNCTUATION)?.[0] ?? '';
  const pathname = trailing ? token.slice(0, -trailing.length) : token;
  const relativePath = relativePrivatePath(pathname, roots);
  if (relativePath === undefined) return token;
  return `${replacementForPrivatePath(relativePath)}${trailing}`;
}

function redactPrivatePaths(value, options = {}) {
  const roots = privateRoots(options);
  return String(value).replaceAll(PATH_TOKEN, (match, token) => {
    const prefixLength = match.length - token.length;
    return `${match.slice(0, prefixLength)}${redactPrivatePathToken(token, roots)}`;
  });
}

function boundedText(value, fallback = '', options = {}) {
  const text = String(value ?? fallback)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\0', '')
    .trim();
  return redactSensitiveText(redactPrivatePaths(text, options)).slice(0, MAX_TEXT_LENGTH).trim();
}

function redactSensitiveText(value) {
  return String(value ?? '')
    .replace(/(--lease-token(?:=|\s+))(?:"[^"]*"|'[^']*'|[^\s'"]+)/g, '$1[redacted-lease-token]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted-token]')
    .replace(/(?:[A-Za-z]:)?[^\s]*\.workflow-runner[^\s]*/g, '[redacted-workflow-runner-private-state]')
    .replace(/\/Users\/[^\s]*\.orbita\/workflow-runs[^\s]*/g, '[redacted-workflow-runs-private-state]');
}

export function isRecoverableBlockerStep(_workflow, _stepId, step) {
  return step?.kind === 'worker' || step?.kind === 'approval';
}

export function isRecoverableBlockerOutput({ workflow, stepId, step, output } = {}) {
  const blockedSignal = step?.kind === 'approval'
    ? output?.approval === 'blocked'
    : output?.outcome === 'blocked';
  return isRecoverableBlockerStep(workflow, stepId, step) &&
    blockedSignal &&
    output?.blocker &&
    typeof output.blocker === 'object' &&
    !Array.isArray(output.blocker);
}

export const isRecoverableWorkerBlockerStep = isRecoverableBlockerStep;
export const isRecoverableWorkerBlockerOutput = isRecoverableBlockerOutput;

export function publicRecoverableBlockerDetails(blocker, { stepId, runsRoot } = {}) {
  const options = { runsRoot };
  const sourceStepId = boundedText(blocker?.source_step_id ?? stepId, stepId, options);
  const needed = boundedText(blocker?.needed ?? blocker?.summary, 'Accepted worker output is required to continue.', options);
  const summary = boundedText(blocker?.summary ?? needed, needed, options);
  const details = {
    summary,
    source_step_id: sourceStepId,
    needed,
  };

  if (Array.isArray(blocker?.evidence)) {
    const evidence = blocker.evidence
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map((entry) => boundedText(entry, '', options))
      .filter(Boolean);
    if (evidence.length > 0) details.evidence = evidence;
  }

  const risk = boundedText(blocker?.risk, '', options);
  if (risk) details.risk = risk;

  return details;
}
