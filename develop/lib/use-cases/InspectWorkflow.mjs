import { runNext } from './RunNext.mjs';
export function inspectWorkflow(input) { return runNext(input); }
export const InspectWorkflow = { execute: inspectWorkflow };
