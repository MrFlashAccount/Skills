import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const DEBUG_SUMMARY_LIMIT = { bytes: 4096, lines: 80 };
const ORCHESTRATOR_DEBUG_LIMIT = { bytes: 4096, lines: 80 };
const PUBLIC_ERROR_LIMIT = { bytes: 2048, lines: 40 };
const DISABLED_DEBUG_HISTORY_VALUES = new Set(['0', 'false', 'off', 'disabled']);
const LEASE_TOKEN_OPTION = /(--lease-token(?:=|\s+))(?:"[^"]*"|'[^']*'|[^\s'"]+)/g;
const WORKFLOW_RUN_TOKEN_ENV = /(WORKFLOW_RUN_TOKEN=)(?:"[^"]*"|'[^']*'|[^\s'"]+)/g;

function richDebugHistoryEnabled(env = process.env) {
  const value = String(env.WORKFLOW_RUNNER_DEBUG_HISTORY ?? '').trim().toLowerCase();
  return !DISABLED_DEBUG_HISTORY_VALUES.has(value);
}

function normalizeText(value) {
  return String(value ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\0', '')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactHistoryText(value, { leaseToken } = {}) {
  let redacted = String(value ?? '')
    .replaceAll(LEASE_TOKEN_OPTION, '$1[redacted-lease-token]')
    .replaceAll(WORKFLOW_RUN_TOKEN_ENV, '$1[redacted-lease-token]');
  if (typeof leaseToken === 'string' && leaseToken.length > 0) {
    redacted = redacted.replaceAll(new RegExp(escapeRegExp(leaseToken), 'g'), '[redacted-lease-token]');
  }
  return redacted;
}

function truncateUtf8(value, maxBytes) {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return { text: value, truncated: false };
  let bytes = 0;
  let text = '';
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    text += char;
  }
  return { text: text.trimEnd(), truncated: true };
}

function boundedLines(value, { bytes, lines, leaseToken } = {}) {
  const normalized = normalizeText(redactHistoryText(value, { leaseToken }));
  if (normalized.length === 0) return { lines: [], truncated: false };
  const split = normalized.split('\n');
  const lineLimited = split.slice(0, lines).join('\n');
  const lineTruncated = split.length > lines;
  const byteLimited = truncateUtf8(lineLimited, bytes);
  const result = byteLimited.text.length === 0 ? [] : byteLimited.text.split('\n');
  return { lines: result, truncated: lineTruncated || byteLimited.truncated };
}

function compactValue(value, fallback = 'n/a', { leaseToken } = {}) {
  if (value === undefined || value === null) return fallback;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const bounded = boundedLines(text, { bytes: 320, lines: 1, leaseToken });
  return bounded.lines[0] ?? fallback;
}

function summarizeResults(results, options = {}) {
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const summaries = results
    .map((result) => compactValue(result?.summary ?? result?.id ?? result?.name ?? result?.type, 'result', options))
    .slice(0, 3);
  const suffix = results.length > summaries.length ? `; +${results.length - summaries.length} more` : '';
  return `count=${results.length} summaries=${summaries.join('; ')}${suffix}`;
}

function summarizeArtifacts(artifacts, options = {}) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return undefined;
  const ids = artifacts
    .map((artifact) => compactValue(artifact?.id, 'artifact', options))
    .slice(0, 5);
  const suffix = artifacts.length > ids.length ? `; +${artifacts.length - ids.length} more` : '';
  return `count=${artifacts.length} ids=${ids.join(', ')}${suffix}`;
}

function outputObject(output) {
  return output && typeof output === 'object' && !Array.isArray(output) ? output : undefined;
}

async function readBoundedRegularFile(pathname, { bytes }) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(pathname, constants.O_RDONLY | constants.O_NONBLOCK | noFollow);
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      const error = new Error('not a regular file');
      error.code = 'ENOTREG';
      throw error;
    }
    const buffer = Buffer.alloc(bytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

async function debugSummaryBodyLines(pathname, { enabled, leaseToken }) {
  if (typeof pathname !== 'string' || pathname.length === 0) return [];
  let body;
  try {
    body = await readBoundedRegularFile(pathname, DEBUG_SUMMARY_LIMIT);
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'unreadable';
    throw new Error(`debug summary file is required but unavailable (${code})`);
  }
  const bounded = boundedLines(body, { ...DEBUG_SUMMARY_LIMIT, leaseToken });
  if (bounded.lines.length === 0) throw new Error('debug summary file must be non-empty');
  if (!enabled) return ['- debug-summary: rich body disabled'];
  const lines = ['- debug-summary body:'];
  lines.push(...bounded.lines.map((line) => `  ${line}`));
  if (bounded.truncated) lines.push(`  [truncated: limit ${DEBUG_SUMMARY_LIMIT.bytes} bytes/${DEBUG_SUMMARY_LIMIT.lines} lines]`);
  return lines;
}

export async function acceptedOutputHistoryDetails({ stepId, request, output, debugSummaryPath, env = process.env, leaseToken } = {}) {
  const options = { leaseToken };
  const action = compactValue(request?.action, 'unknown', options);
  const details = [`- accepted output summary: step=${compactValue(stepId, 'unknown', options)} action=${action}`];
  const object = outputObject(output);
  if (!object) {
    details.push(`- accepted output value: ${compactValue(output, 'n/a', options)}`);
    return details;
  }
  if (Object.hasOwn(object, 'outcome')) details.push(`- outcome: ${compactValue(object.outcome, 'n/a', options)}`);
  if (Object.hasOwn(object, 'approval')) details.push(`- approval: ${compactValue(object.approval, 'n/a', options)}`);
  const results = summarizeResults(object.results, options);
  if (results) details.push(`- results: ${results}`);
  const artifacts = summarizeArtifacts(object.artifacts, options);
  if (artifacts) details.push(`- artifacts: ${artifacts}`);
  if (object.blocker) details.push(`- blocker summary: ${compactValue(object.blocker.summary ?? object.blocker.needed ?? object.blocker, 'n/a', options)}`);

  details.push(...await debugSummaryBodyLines(debugSummaryPath, { enabled: richDebugHistoryEnabled(env), leaseToken }));
  return details;
}

export function transitionHistoryDetails({ before, after, output, requests } = {}) {
  const details = [
    `- transition: cursor=${compactValue(before?.cursor, 'unknown')} status=${compactValue(before?.status, 'unknown')} -> cursor=${compactValue(after?.cursor, 'unknown')} status=${compactValue(after?.status, 'unknown')}`,
  ];
  if (output) details.push(`- applied output: ${compactValue(output)}`);
  if (after?.status === 'done' || after?.status === 'blocked') details.push(`- terminal: status=${after.status} cursor=${compactValue(after.cursor, 'unknown')}`);
  const nextRequests = Array.isArray(requests) && requests.length > 0
    ? requests.map((request) => `id=${request.id} action=${request.action}`).join('; ')
    : 'none';
  details.push(`- next requests: ${nextRequests}`);
  return details;
}

export function publicFailureHistoryDetails({ command, error, leaseToken } = {}) {
  const options = { leaseToken };
  const bounded = boundedLines(error, { ...PUBLIC_ERROR_LIMIT, leaseToken });
  const lines = [`- public failure: command=${compactValue(command, 'workflow-runner', options)}`, '- public error:'];
  lines.push(...(bounded.lines.length > 0 ? bounded.lines : ['unknown']).map((line) => `  ${line}`));
  if (bounded.truncated) lines.push(`  [truncated: limit ${PUBLIC_ERROR_LIMIT.bytes} bytes/${PUBLIC_ERROR_LIMIT.lines} lines]`);
  return lines;
}

export function orchestratorDebugHistoryDetails({ note, leaseToken } = {}) {
  const text = typeof note === 'string' ? note : JSON.stringify(note ?? {});
  const bounded = boundedLines(text, { ...ORCHESTRATOR_DEBUG_LIMIT, leaseToken });
  const lines = ['- orchestrator debug summary:'];
  lines.push(...(bounded.lines.length > 0 ? bounded.lines : ['empty']).map((line) => `  ${line}`));
  if (bounded.truncated) lines.push(`  [truncated: limit ${ORCHESTRATOR_DEBUG_LIMIT.bytes} bytes/${ORCHESTRATOR_DEBUG_LIMIT.lines} lines]`);
  return lines;
}
