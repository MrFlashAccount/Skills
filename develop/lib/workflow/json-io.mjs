import { readFileSync } from 'node:fs';
import { WorkflowRuntimeError } from './errors.mjs';

export function readJson(path, name) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new WorkflowRuntimeError(`cannot read ${name} as JSON from ${path}: ${error.message}`);
  }
}
