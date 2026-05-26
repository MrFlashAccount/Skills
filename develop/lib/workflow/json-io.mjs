import { readFileSync } from 'node:fs';
import { WorkflowInterpreterError } from './errors.mjs';

export function readJson(path, name) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new WorkflowInterpreterError(`cannot read ${name} as JSON from ${path}: ${error.message}`);
  }
}
