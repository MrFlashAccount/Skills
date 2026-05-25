#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import validateBatonSchema from '../dist/validators/baton.mjs';
import validateWorkflowSchema from '../dist/validators/workflow.mjs';
import validateWorkerOutputSchema from '../dist/validators/worker-output.mjs';
import validateWorkflowInterpreterResponseSchema from '../dist/validators/workflow-interpreter-response.mjs';

function fail(message) {
  console.error(`workflow-interpreter: ${message}`);
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

function artifactType(artifact) {
  return artifact?.type ?? artifact?.id;
}

function hasArtifactType(artifacts, type) {
  return artifacts.some((artifact) => artifactType(artifact) === type);
}

function validateTakesPrerequisites(step, baton, cursorId) {
  const takesArtifacts = step.takesArtifacts ?? [];
  if (!Array.isArray(takesArtifacts)) fail(`workflow.steps.${cursorId}.takesArtifacts must be a list when present`);
  const artifacts = baton.state?.artifacts ?? [];
  if (!Array.isArray(artifacts)) fail('baton.state.artifacts must be an array');

  for (const requiredType of takesArtifacts) {
    if (typeof requiredType !== 'string' || !requiredType) fail(`workflow.steps.${cursorId}.takesArtifacts entries must be non-empty strings`);
    if (!hasArtifactType(artifacts, requiredType)) {
      fail(`baton missing required artifact type for cursor '${cursorId}': ${requiredType}`);
    }
  }
}

function validateProducedArtifacts(step, output, cursorId, sourceName = 'worker output') {
  const producesArtifacts = step.producesArtifacts ?? [];
  if (!Array.isArray(producesArtifacts)) fail(`workflow.steps.${cursorId}.producesArtifacts must be a list when present`);
  const outputArtifacts = output.artifacts ?? [];

  for (const producedType of producesArtifacts) {
    if (typeof producedType !== 'string' || !producedType) fail(`workflow.steps.${cursorId}.producesArtifacts entries must be non-empty strings`);
    if (!hasArtifactType(outputArtifacts, producedType)) fail(`${sourceName} missing required artifact type for cursor '${cursorId}': ${producedType}`);
  }
}

function mergeArtifacts(existingArtifacts, newArtifacts = []) {
  const merged = [...existingArtifacts];
  for (const artifact of newArtifacts) {
    const index = artifact.id ? merged.findIndex((existing) => existing.id === artifact.id) : -1;
    if (index >= 0) merged[index] = artifact;
    else merged.push(artifact);
  }
  return merged;
}

function appendResults(existingResults = [], newResults = []) {
  return [...existingResults, ...newResults];
}

function extractOutcomeLabel(output, step, cursorId) {
  requireObject(output, 'worker output');
  const stepKind = step.kind ?? 'subagent';

  if (stepKind === 'user_approval') {
    if ('outcome' in output) fail(`approval cursor '${cursorId}' must use approval, not outcome`);
    if (!('approval' in output)) fail(`approval cursor '${cursorId}' must include string approval`);
    const approval = output.approval;
    if (typeof approval !== 'string' || !approval) fail(`approval cursor '${cursorId}' must include string approval`);
    return approval;
  }

  if ('approval' in output) fail(`cursor '${cursorId}' must use outcome, not approval`);
  if (!('outcome' in output)) fail(`cursor '${cursorId}' must include string outcome`);
  const outcome = output.outcome;
  if (typeof outcome !== 'string' || !outcome) fail(`cursor '${cursorId}' must include string outcome`);
  return outcome;
}

function actionForStep(step) {
  if (step.kind === 'terminal') return step.producesArtifacts?.includes('final_summary') ? 'stop_done' : 'stop_blocked';
  if (step.kind === 'user_approval') return 'wait_for_approval';
  return 'run_worker';
}

function buildDirective(stepId, step) {
  return {
    id: stepId,
    action: actionForStep(step),
    vertex: structuredClone(step),
  };
}

function loadWorkflowAndBaton(workflowPath, batonPath) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  const baton = readJson(batonPath, 'baton');

  assertSchema(validateWorkflowSchema, workflowDoc, 'workflow');
  assertSchema(validateBatonSchema, baton, 'baton');

  const workflow = workflowDoc.workflow;
  const cursorStep = workflow.steps[baton.cursor];
  if (!cursorStep) fail(`baton cursor not found in workflow: ${baton.cursor}`);

  return { workflow, baton, cursorStep };
}

function emitWorkflowInterpreterResponse(response) {
  assertSchema(validateWorkflowInterpreterResponseSchema, response, 'workflow interpreter response');
  console.log(JSON.stringify(response, null, 2));
}

function directiveMode(workflowPath, batonPath) {
  const { baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  validateTakesPrerequisites(cursorStep, baton, baton.cursor);
  emitWorkflowInterpreterResponse({ baton, directive: buildDirective(baton.cursor, cursorStep) });
}

function applyMode(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const workerOutput = readJson(outputPath, 'worker output');

  assertSchema(validateWorkerOutputSchema, workerOutput, 'worker output');
  requireObject(cursorStep.outcomes, `workflow.steps.${baton.cursor}.outcomes`);

  validateTakesPrerequisites(cursorStep, baton, baton.cursor);
  const outcomeLabel = extractOutcomeLabel(workerOutput, cursorStep, baton.cursor);
  const targetStepId = cursorStep.outcomes[outcomeLabel];
  if (!targetStepId) fail(`outcome '${outcomeLabel}' is not allowed from baton cursor '${baton.cursor}'`);

  const targetStep = workflow.steps[targetStepId];
  if (!targetStep) fail(`outcome target not found in workflow: ${targetStepId}`);

  validateProducedArtifacts(cursorStep, workerOutput, baton.cursor);

  const updatedBaton = structuredClone(baton);
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = targetStepId === workflow.done ? 'done' : targetStepId === workflow.blocked ? 'blocked' : 'running';
  updatedBaton.state = {
    ...updatedBaton.state,
    artifacts: mergeArtifacts(updatedBaton.state?.artifacts ?? [], workerOutput.artifacts ?? []),
    results: appendResults(updatedBaton.state?.results ?? [], workerOutput.results ?? []),
  };
  if (workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  emitWorkflowInterpreterResponse({ baton: updatedBaton, directive: buildDirective(targetStepId, targetStep) });
}

const args = process.argv.slice(2);
const mode = args[0];

if (mode === 'inspect' || mode === 'directive') {
  const [, workflowPath, batonPath] = args;
  if (!workflowPath || !batonPath || args.length !== 3) {
    fail('usage: node scripts/workflow-interpreter.mjs inspect <workflow.json> <baton.json>');
  }
  directiveMode(workflowPath, batonPath);
} else if (mode === 'apply') {
  const [, workflowPath, batonPath, outputPath] = args;
  if (!workflowPath || !batonPath || !outputPath || args.length !== 4) {
    fail('usage: node scripts/workflow-interpreter.mjs apply <workflow.json> <baton.json> <worker-output.json>');
  }
  applyMode(workflowPath, batonPath, outputPath);
} else {
  const [workflowPath, batonPath, outputPath] = args;
  if (!workflowPath || !batonPath || !outputPath || args.length !== 3) {
    fail('usage: node scripts/workflow-interpreter.mjs inspect <workflow.json> <baton.json> | apply <workflow.json> <baton.json> <worker-output.json>');
  }
  applyMode(workflowPath, batonPath, outputPath);
}
