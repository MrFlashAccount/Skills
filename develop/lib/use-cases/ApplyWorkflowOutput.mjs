import { continueRun } from './ContinueRun.mjs';
export function applyWorkflowOutput(input) { return continueRun(input); }
export const ApplyWorkflowOutput = { execute: applyWorkflowOutput };
