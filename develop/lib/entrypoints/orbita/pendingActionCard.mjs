// Pending action card helpers for resurfacing workflow gates through Orbita.
// Keeps artifact attachment checks local and public text redacted before delivery.

import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { workflowRunsRoot as defaultWorkflowRunsRoot } from '../../persistence/run-state/paths.mjs';
import { boundedNativeTitle, compactLineValue, redactSensitivePublicText, safePublicRequestId, safeWorkflowRunTitle, workflowRunNeedsHumanAction } from './nativePresentation.mjs';

function workflowRunsRootForArtifacts(pluginConfig = {}) {
  return pluginConfig.workflowRunsRoot || pluginConfig.runsRootWorkflow || pluginConfig.workflow_runs_root || defaultWorkflowRunsRoot;
}

function candidateOutputSummaries(value, summaries = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return summaries;
  const add = (entry) => {
    if (typeof entry !== 'string') return;
    const safe = redactSensitivePublicText(entry);
    if (safe) summaries.push(safe);
  };
  if (Array.isArray(value.summary)) for (const item of value.summary) add(item);
  else add(value.summary);
  if (Array.isArray(value.evidence_checked) && value.evidence_checked.length > 0) add(`Evidence checked: ${value.evidence_checked.slice(0, 3).join(', ')}`);
  add(value.recommendation);
  if (value.research_packet) candidateOutputSummaries(value.research_packet, summaries);
  if (value.verdict) candidateOutputSummaries(value.verdict, summaries);
  if (Array.isArray(value.findings)) {
    for (const finding of value.findings.slice(0, 3)) add(finding?.summary ?? finding?.description);
  }
  if (Array.isArray(value.open_questions) && value.open_questions.length > 0) add(`Open question: ${value.open_questions[0]}`);
  return summaries;
}

function uniqueBoundedLines(lines = [], limit = 6) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const safe = redactSensitivePublicText(line);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    result.push(safe.length > 220 ? `${safe.slice(0, 219).trim()}…` : safe);
    if (result.length >= limit) break;
  }
  return result;
}

function outputsFromResponse(response = {}) {
  const outputs = response?.baton?.state?.outputs;
  return outputs && typeof outputs === 'object' && !Array.isArray(outputs) ? outputs : {};
}

function publicPriorSummaries(response = {}) {
  const lines = [];
  for (const output of Object.values(outputsFromResponse(response))) candidateOutputSummaries(output, lines);
  return uniqueBoundedLines(lines);
}

function artifactRefsFromOutput(output, refs = [], producerStepId) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return refs;
  if (Array.isArray(output.artifacts)) {
    refs.push(...output.artifacts.map((artifact) => ({ artifact, producerStepId })).filter((entry) => entry.artifact));
  }
  for (const value of Object.values(output)) {
    if (value && typeof value === 'object') artifactRefsFromOutput(value, refs, producerStepId);
  }
  return refs;
}

function rawArtifactRefsFromResponse(response = {}) {
  const refs = [];
  for (const [producerStepId, output] of Object.entries(outputsFromResponse(response))) artifactRefsFromOutput(output, refs, producerStepId);
  const aggregate = response?.baton?.state?.artifacts;
  if (Array.isArray(aggregate)) {
    refs.push(...aggregate
      .map((entry) => ({ artifact: entry?.artifact, producerStepId: entry?.producerStepId }))
      .filter((entry) => entry.artifact && isSafeArtifactStepId(entry.producerStepId)));
  }
  return refs;
}

function isSafeArtifactStepId(value) {
  if (typeof value !== 'string' || !value) return false;
  return value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\') && !value.startsWith('.');
}

const LOCAL_ARTIFACT_PATH = Symbol.for('openclaw.orbita.localArtifactPath');

function isWithinRealDirectory(filePath, directoryPath) {
  return filePath === directoryPath || filePath.startsWith(`${directoryPath}${sep}`);
}

function safeArtifactRelativePathSegments(value) {
  const segments = value.split(sep).filter(Boolean);
  if (segments.length < 3 || segments[1] !== 'artifacts') return undefined;
  if (!segments.every((segment, index) => {
    if (segment === '.' || segment === '..' || segment.startsWith('.')) return false;
    if (index === 1 && segment !== 'artifacts') return false;
    return true;
  })) return undefined;
  return segments;
}

function resolveBatonArtifactPath(runDir, artifactPath) {
  if (typeof artifactPath !== 'string' || !artifactPath) return undefined;
  if (isAbsolute(artifactPath)) return resolve(artifactPath);
  if (artifactPath.split(/[\\/]+/).some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) return undefined;
  return resolve(runDir, artifactPath);
}

async function safeArtifactAttachments(pluginConfig = {}, runId, response = {}) {
  const runsRoot = workflowRunsRootForArtifacts(pluginConfig);
  if (!runsRoot || typeof runId !== 'string' || !runId) return [];
  const runDir = resolve(runsRoot, runId);
  let realRunDir;
  try {
    realRunDir = await realpath(runDir);
  } catch {
    return [];
  }
  const attachments = [];
  const seen = new Set();
  for (const { artifact, producerStepId } of rawArtifactRefsFromResponse(response)) {
    const trustedStepId = isSafeArtifactStepId(producerStepId) ? producerStepId : undefined;
    const artifactPath = typeof artifact?.path === 'string' ? artifact.path : undefined;
    const resolved = resolveBatonArtifactPath(runDir, artifactPath);
    if (!resolved || seen.has(resolved)) continue;
    let stat;
    let realArtifactPath;
    try {
      stat = await lstat(resolved);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      realArtifactPath = await realpath(resolved);
    } catch {
      continue;
    }
    const relativeToRun = relative(realRunDir, realArtifactPath);
    if (relativeToRun.startsWith('..') || isAbsolute(relativeToRun)) continue;
    const relativeSegments = safeArtifactRelativePathSegments(relativeToRun);
    if (!relativeSegments) continue;
    if (!trustedStepId) continue;
    const stepId = trustedStepId;
    const expectedArtifactDir = resolve(runDir, stepId, 'artifacts');
    let realExpectedArtifactDir;
    try {
      realExpectedArtifactDir = await realpath(expectedArtifactDir);
    } catch {
      continue;
    }
    if (!isWithinRealDirectory(realArtifactPath, realExpectedArtifactDir)) continue;
    seen.add(resolved);
    const attachment = {
      id: safeWorkflowRunTitle(artifact.id),
      summary: safeWorkflowRunTitle(artifact.summary),
      content_type: safeWorkflowRunTitle(artifact.content_type),
    };
    Object.defineProperty(attachment, LOCAL_ARTIFACT_PATH, { value: resolved });
    attachments.push(attachment);
    if (attachments.length >= 8) break;
  }
  return attachments;
}

function isApprovalPendingAction({ run = {}, request = {}, response = {}, stepId } = {}) {
  const normalizedStepId = String(stepId ?? run.currentGate ?? run.currentStep ?? '');
  const outputSchema = String(request?.outputSchema ?? request?.output_schema ?? '');
  if (/(?:^|[_-])(?:ask|question)(?:$|[_-])|question/i.test(normalizedStepId) || /question/i.test(outputSchema)) return false;
  const step = response?.workflow?.steps?.[stepId];
  if (step?.kind === 'approval') return true;
  return request?.action === 'wait_for_approval' && /(?:^|[_-])approv(?:e|al)(?:$|[_-])/i.test(normalizedStepId);
}

function humanizedStepLabel(stepId = 'pending action') {
  return String(stepId).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'pending action';
}

function artifactTextLines(attachments = []) {
  if (attachments.length === 0) return ['Artifacts: none attached.'];
  return [
    'Artifacts attached:',
    ...attachments.map((artifact, index) => `• ${artifact.summary || artifact.id || `artifact ${index + 1}`}`),
  ];
}

function commandBlocks(commands = []) {
  const safeCommands = commands.filter((command) => typeof command === 'string' && command.trim()).map((command) => command.trim());
  return safeCommands.map((command) => `\`\`\`text\n${command}\n\`\`\``).join('\n');
}

function expectedUserActionText(actionKind, runId) {
  if (actionKind === 'approval') {
    return commandBlocks([
      `/orbita approve ${runId}`,
      `/orbita reject ${runId} reason`,
      `/orbita reply ${runId} text`,
    ]);
  }
  return commandBlocks([`/orbita reply ${runId} text`]);
}

function pendingUserActionText({ run, response, stepId, request, degradedReason, attachments = [] }) {
  const title = boundedNativeTitle(run.title ?? run.workflow?.identity);
  const requestId = compactLineValue(safePublicRequestId(run.requestId) ?? safePublicRequestId(response?.requestId));
  const actionKind = isApprovalPendingAction({ run, request, response, stepId }) ? 'approval' : 'question';
  const summaries = publicPriorSummaries(response);
  const summaryLines = summaries.length > 0
    ? summaries.map((line) => `• ${line}`)
    : [`• ${actionKind === 'approval' ? `Approve this workflow checkpoint for ${title}.` : `Answer this workflow question for ${title}.`}`];
  const degradedLine = degradedReason
    ? `\nDegraded: action metadata is unavailable (${degradedReason}); using stored waiting state.`
    : '';
  const heading = actionKind === 'approval' ? '🪐 Orbita ждёт approval' : '🪐 Orbita ждёт ответ';
  const expected = expectedUserActionText(actionKind, run.runId);
  return `${heading}\n${title}\nrun id: \`${run.runId}\`\nRequest ID: ${requestId}\nNeeded: ${actionKind === 'approval' ? 'approval' : 'answer'}${degradedLine}\n\nSummary:\n${summaryLines.join('\n')}\n\n${artifactTextLines(attachments).join('\n')}\n\nДетали workflow скрыты: внутренние инструкции и служебное состояние не показываю в публичном сообщении.\n\nExpected answer:\n${expected}`;
}


function localArtifactPath(attachment) {
  return attachment?.[LOCAL_ARTIFACT_PATH];
}

export {
  localArtifactPath,
  pendingUserActionText,
  safeArtifactAttachments,
};
