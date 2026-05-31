import { validateWorkflowDocument as validateDocument } from '../validate/workflow-validator.mjs';

/** Validates an already-loaded workflow DTO. Filesystem loading belongs to persistence/entrypoints. */
export function validateWorkflowDocument({ workflow, workflowPath = 'workflow.json', repositoryRoot } = {}) {
  return validateDocument(workflow, { workflowPath, repositoryRoot });
}
