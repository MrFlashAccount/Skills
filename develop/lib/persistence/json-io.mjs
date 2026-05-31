import { readFileSync } from 'node:fs';
import { WorkflowInterpreterError } from '../entities/Workflow/errors.mjs';

export function readJson(path, name) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new WorkflowInterpreterError(`cannot read ${name} as JSON from ${path}: ${error.message}`);
  }
}

export function readText(path, name = 'file') {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new WorkflowInterpreterError(`cannot read ${name} from ${path}: ${error.message}`);
  }
}
