#!/usr/bin/env node
import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`dev-harness-step: ${message}`);
  process.exit(1);
}

function parseScalar(value) {
  if (value === '') return '';
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^['"]|['"]$/g, '');
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== '\\') quote = quote === char ? null : quote ?? char;
    if (char === '#' && !quote) return line.slice(0, i);
  }
  return line;
}

function parseInlineMap(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return {};
  return Object.fromEntries(inner.split(',').map((part) => {
    const [key, ...rest] = part.split(':');
    if (!key || rest.length === 0) fail(`cannot parse inline map entry: ${part}`);
    return [key.trim(), parseScalar(rest.join(':').trim())];
  }));
}

function parseYamlSubset(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = stripComment(rawLine).replace(/\s+$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();

    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).value;

    if (trimmed.startsWith('- ')) {
      if (!Array.isArray(parent)) fail(`list item has non-list parent: ${trimmed}`);
      const item = trimmed.slice(2).trim();
      parent.push(item.startsWith('{') && item.endsWith('}') ? parseInlineMap(item) : parseScalar(item));
      continue;
    }

    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) fail(`cannot parse line: ${trimmed}`);
    const key = match[1].trim();
    const rest = match[2].trim();

    if (Array.isArray(parent)) fail(`map entry has list parent: ${trimmed}`);

    if (rest === '') {
      const nextLine = lines.slice(lineIndex + 1).find((candidate) => stripComment(candidate).trim());
      const child = nextLine && nextLine.match(/^ */)[0].length > indent && stripComment(nextLine).trim().startsWith('- ') ? [] : {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else if (rest.startsWith('{') && rest.endsWith('}')) {
      parent[key] = parseInlineMap(rest);
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return root;
}

function readData(path) {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    return parseYamlSubset(text);
  }
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
}

function validateBaton(baton) {
  requireObject(baton, 'baton');
  for (const field of ['currentStep', 'status', 'artifacts', 'approvals']) {
    if (!(field in baton)) fail(`baton missing required field: ${field}`);
  }
  if (typeof baton.currentStep !== 'string' || !baton.currentStep) fail('baton.currentStep must be a non-empty string');
  if (typeof baton.status !== 'string' || !baton.status) fail('baton.status must be a non-empty string');
  requireObject(baton.artifacts, 'baton.artifacts');
  requireObject(baton.approvals, 'baton.approvals');
}

function readPath(value, path) {
  return path.split('.').reduce((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return current[segment];
  }, value);
}

function hasPath(value, path) {
  return readPath(value, path) !== undefined;
}

function isSupportedContractPath(path) {
  return path.startsWith('artifacts.') || path.startsWith('approvals.');
}

function validateTakesPrerequisites(step, baton, stepId) {
  const takes = step.takes ?? [];
  if (!Array.isArray(takes)) fail(`workflow.steps.${stepId}.takes must be a list when present`);

  for (const takenPath of takes) {
    if (typeof takenPath !== 'string' || !takenPath) fail(`workflow.steps.${stepId}.takes entries must be non-empty strings`);
    if (isSupportedContractPath(takenPath) && !hasPath(baton, takenPath)) {
      fail(`baton missing required taken field: ${takenPath}`);
    }
  }
}

function validateProducedFields(step, value, stepId, sourceName = 'worker output') {
  const produces = step.produces ?? [];
  if (!Array.isArray(produces)) fail(`workflow.steps.${stepId}.produces must be a list when present`);

  for (const producedPath of produces) {
    if (typeof producedPath !== 'string' || !producedPath) fail(`workflow.steps.${stepId}.produces entries must be non-empty strings`);
    if (!isSupportedContractPath(producedPath)) {
      fail(`workflow.steps.${stepId}.produces unsupported path: ${producedPath}`);
    }
    if (!hasPath(value, producedPath)) fail(`${sourceName} missing required produced field: ${producedPath}`);
  }
}

function extractTransitionLabel(output, step, stepId) {
  requireObject(output, 'worker output');
  const stepKind = step.kind ?? 'subagent';

  if (stepKind === 'user_approval') {
    if ('outcome' in output) fail(`approval step '${stepId}' must use approval, not outcome`);
    if (!('approval' in output)) fail(`approval step '${stepId}' must include string approval`);
    if (!hasPath(output, 'approvals')) fail(`approval step '${stepId}' must include approvals object`);
    requireObject(output.approvals, 'worker output.approvals');
    const approval = output.approval;
    if (typeof approval !== 'string' || !approval) fail(`approval step '${stepId}' must include string approval`);
    return approval;
  }

  if ('approval' in output) fail(`step '${stepId}' must use outcome, not approval`);
  if (!('outcome' in output)) fail(`step '${stepId}' must include string outcome`);
  const outcome = output.outcome;
  if (typeof outcome !== 'string' || !outcome) fail(`step '${stepId}' must include string outcome`);
  return outcome;
}

function nextAction(step) {
  if (!step) return 'stop';
  if (step.kind === 'terminal') return step.produces?.includes('final_summary') ? 'stop_done' : 'stop_blocked';
  if (step.kind === 'user_approval') return 'wait_for_approval';
  return 'generate_worker_prompt';
}

const [workflowPath, batonPath, outputPath] = process.argv.slice(2);
if (!workflowPath || !batonPath || !outputPath) {
  fail('usage: node develop/dev-harness-step.mjs <workflow.yaml|json> <baton.yaml|json> <worker-output.yaml|json>');
}

const workflowDoc = readData(workflowPath);
const baton = readData(batonPath);
const workerOutput = readData(outputPath);

validateBaton(baton);
const workflow = workflowDoc.workflow ?? workflowDoc;
requireObject(workflow, 'workflow');
requireObject(workflow.steps, 'workflow.steps');

const currentStep = workflow.steps[baton.currentStep];
if (!currentStep) fail(`current step not found in workflow: ${baton.currentStep}`);
requireObject(currentStep.outcomes, `workflow.steps.${baton.currentStep}.outcomes`);

validateTakesPrerequisites(currentStep, baton, baton.currentStep);
const transitionLabel = extractTransitionLabel(workerOutput, currentStep, baton.currentStep);
const targetStepId = currentStep.outcomes[transitionLabel];
if (!targetStepId) fail(`transition '${transitionLabel}' is not allowed from step '${baton.currentStep}'`);

const targetStep = workflow.steps[targetStepId];
if (!targetStep) fail(`transition target not found in workflow: ${targetStepId}`);

const updatedBaton = structuredClone(baton);
updatedBaton.currentStep = targetStepId;
updatedBaton.status = targetStepId === workflow.done ? 'done' : targetStepId === workflow.blocked ? 'blocked' : 'running';
updatedBaton.lastOutcome = transitionLabel;
if (workerOutput.artifacts) updatedBaton.artifacts = { ...updatedBaton.artifacts, ...workerOutput.artifacts };
if (workerOutput.approvals) updatedBaton.approvals = { ...updatedBaton.approvals, ...workerOutput.approvals };
if (workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

validateProducedFields(currentStep, workerOutput, baton.currentStep);

const nextStep = {
  id: targetStepId,
  kind: targetStep.kind ?? null,
  template: targetStep.template ?? null,
  takes: targetStep.takes ?? [],
  produces: targetStep.produces ?? [],
  action: nextAction(targetStep),
};

console.log(JSON.stringify({ baton: updatedBaton, nextStep }, null, 2));
