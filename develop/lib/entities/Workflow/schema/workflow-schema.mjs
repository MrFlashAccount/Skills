import workflowSchema from './workflow.json' with { type: 'json' };
import { assertSchema } from '../../../schema-kernel/index.mjs';

export class WorkflowSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkflowSchemaError';
  }
}

function hasMatchCasesShape(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'match' in value && 'cases' in value;
}

function assertNoNestedMatchCasesTarget(target, fieldPath) {
  if (hasMatchCasesShape(target)) throw new WorkflowSchemaError(`nested match/cases transitions are not supported at ${fieldPath}`);

  if (!Array.isArray(target)) return;
  for (const [index, item] of target.entries()) {
    if (hasMatchCasesShape(item)) throw new WorkflowSchemaError(`nested match/cases transitions are not supported at ${fieldPath}.${index}`);
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

export { workflowSchema };

export function assertWorkflowSchema(workflowDoc, { externalSchemas = [] } = {}) {
  try {
    assertWorkflowNoNestedMatchCases(workflowDoc);
    assertSchema(workflowSchema, workflowDoc, 'workflow', { schemas: [workflowSchema, ...externalSchemas] });
  } catch (error) {
    if (error instanceof WorkflowSchemaError) throw new WorkflowSchemaError(`workflow failed schema validation: ${error.message}`);
    if (error?.name === 'SchemaValidationError') throw new WorkflowSchemaError(error.message);
    throw error;
  }
}
