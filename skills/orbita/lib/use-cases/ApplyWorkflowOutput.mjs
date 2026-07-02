/** ApplyWorkflowOutput use-case facade. */
import { applyWorkflowOutput } from './internal/workflow-output/apply.mjs';

export { applyWorkflowOutput };

export const ApplyWorkflowOutput = { execute: applyWorkflowOutput };
