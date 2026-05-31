import batonSchema from '../schemas/baton.json' with { type: 'json' };
import workflowInterpreterCliArgsSchema from '../schemas/internal/cli-args/workflow-interpreter.json' with { type: 'json' };
import workerOutputSchema from '../schemas/worker-output.json' with { type: 'json' };
import workflowInterpreterResponseSchema from '../schemas/workflow-interpreter-response.json' with { type: 'json' };
import workflowSchema from '../schemas/workflow.json' with { type: 'json' };
import reviewerSelectionOutputSchema from '../../../workflows/dev-harness/schemas/reviewer-selection-output.json' with { type: 'json' };
import { validateJsonSchema } from 'schema-validation';
import { WorkflowInterpreterError } from '../entities/Workflow/errors.mjs';

export const workflowSchemas = [
  batonSchema,
  reviewerSelectionOutputSchema,
  workflowInterpreterCliArgsSchema,
  workerOutputSchema,
  workflowInterpreterResponseSchema,
  workflowSchema,
];

export {
  batonSchema,
  reviewerSelectionOutputSchema,
  workflowInterpreterCliArgsSchema,
  workerOutputSchema,
  workflowInterpreterResponseSchema,
  workflowSchema,
};

export function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

export function assertSchema(schema, value, name) {
  const validation = validateJsonSchema(schema, value, { schemas: workflowSchemas });
  if (!validation.ok) throw new WorkflowInterpreterError(`${name} failed schema validation: ${formatSchemaErrors(validation.errors)}`);
}

function hasMatchCasesShape(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'match' in value && 'cases' in value;
}

function assertNoNestedMatchCasesTarget(target, fieldPath) {
  if (hasMatchCasesShape(target)) throw new WorkflowInterpreterError(`nested match/cases transitions are not supported at ${fieldPath}`);

  if (!Array.isArray(target)) return;
  for (const [index, item] of target.entries()) {
    if (hasMatchCasesShape(item)) throw new WorkflowInterpreterError(`nested match/cases transitions are not supported at ${fieldPath}.${index}`);
  }
}

function assertWorkflowNoNestedMatchCases(workflowDoc) {
  const steps = workflowDoc?.steps;
  if (!steps || typeof steps !== 'object' || Array.isArray(steps)) return;

  for (const [stepId, step] of Object.entries(steps)) {
    const next = step?.next;
    const items = Array.isArray(next) ? next : [next];
    for (const [index, item] of items.entries()) {
      if (!hasMatchCasesShape(item) || !item.cases || typeof item.cases !== 'object' || Array.isArray(item.cases)) continue;
      const basePath = Array.isArray(next) ? `steps.${stepId}.next.${index}` : `steps.${stepId}.next`;
      for (const [caseKey, target] of Object.entries(item.cases)) {
        assertNoNestedMatchCasesTarget(target, `${basePath}.cases.${caseKey}`);
      }
    }
  }
}


export function assertWorkflowSchema(workflowDoc) {
  try {
    assertWorkflowNoNestedMatchCases(workflowDoc);
  } catch (error) {
    if (error instanceof WorkflowInterpreterError) throw new WorkflowInterpreterError(`workflow failed schema validation: ${error.message}`);
    throw error;
  }
  assertSchema(workflowSchema, workflowDoc, 'workflow');
}

export function assertBatonSchema(baton) {
  assertSchema(batonSchema, baton, 'baton');
}

export function assertWorkerOutputSchema(workerOutput) {
  assertSchema(workerOutputSchema, workerOutput, 'worker output');
}

export function assertResponseSchema(response) {
  assertSchema(workflowInterpreterResponseSchema, response, 'workflow interpreter response');
}
