#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import validateBatonSchema from './dist/validate-baton.mjs';
import validateWorkflowSchema from './dist/validate-workflow.mjs';
import validateWorkerOutputSchema from './dist/validate-worker-output.mjs';
import validateHandoffResponseSchema from './dist/validate-handoff-response.mjs';

function fail(message) {
  console.error(`dev-harness-step: ${message}`);
  process.exit(1);
}

function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

function assertSchema(validate, value, name) {
  if (!validate(value)) fail(`${name} failed schema validation: ${formatSchemaErrors(validate.errors)}`);
}

function readJson(path, name) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${name} as JSON from ${path}: ${error.message}`);
  }
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
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

function extractHandoffLabel(output, step, stepId) {
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
  fail('usage: node develop/dev-harness-step.mjs <workflow.json> <baton.json> <worker-output.json>');
}

const workflowDoc = readJson(workflowPath, 'workflow');
const baton = readJson(batonPath, 'baton');
const workerOutput = readJson(outputPath, 'worker output');

assertSchema(validateWorkflowSchema, workflowDoc, 'workflow');
assertSchema(validateBatonSchema, baton, 'baton');
assertSchema(validateWorkerOutputSchema, workerOutput, 'worker output');

const workflow = workflowDoc.workflow;
const currentStep = workflow.steps[baton.currentStep];
if (!currentStep) fail(`current step not found in workflow: ${baton.currentStep}`);
requireObject(currentStep.outcomes, `workflow.steps.${baton.currentStep}.outcomes`);

validateTakesPrerequisites(currentStep, baton, baton.currentStep);
const handoffLabel = extractHandoffLabel(workerOutput, currentStep, baton.currentStep);
const targetStepId = currentStep.outcomes[handoffLabel];
if (!targetStepId) fail(`handoff '${handoffLabel}' is not allowed from step '${baton.currentStep}'`);

const targetStep = workflow.steps[targetStepId];
if (!targetStep) fail(`handoff target not found in workflow: ${targetStepId}`);

const updatedBaton = structuredClone(baton);
updatedBaton.currentStep = targetStepId;
updatedBaton.status = targetStepId === workflow.done ? 'done' : targetStepId === workflow.blocked ? 'blocked' : 'running';
updatedBaton.lastOutcome = handoffLabel;
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

const handoffResponse = { baton: updatedBaton, nextStep };
assertSchema(validateHandoffResponseSchema, handoffResponse, 'handoff response');

console.log(JSON.stringify(handoffResponse, null, 2));
