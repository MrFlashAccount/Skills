/**
 * Baton entity owns runtime cursor/status/state consistency and safe state updates.
 */
import { WorkflowRuntimeError } from './errors.mjs';
import { assertBatonSchema } from '../entities/workflow-helpers/schema-validation.mjs';
import { statusForStep } from './workflow-helpers/model.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

function workflowData(workflow) {
  return typeof workflow?.toJSON === 'function' ? workflow.toJSON() : workflow;
}

function artifactType(artifact) {
  return artifact?.type ?? artifact?.id;
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

function aggregateArray(output, fieldName) {
  const value = output[fieldName];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new WorkflowRuntimeError(`worker output failed schema validation: /${fieldName} must be array`);
  return value;
}

export class Baton {
  constructor(batonData) {
    this.data = cloneBoundaryData(batonData);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }

  validateAgainst(workflowInput) {
    const workflow = workflowData(workflowInput);
    assertBatonSchema(this.data);
    const cursorStep = workflow.steps?.[this.data.cursor];
    if (!cursorStep) throw new WorkflowRuntimeError(`baton cursor not found in workflow: ${this.data.cursor}`);
    const expectedStatus = statusForStep(workflow, this.data.cursor, cursorStep);
    if (this.data.status !== expectedStatus) {
      throw new WorkflowRuntimeError(`baton status '${this.data.status}' is inconsistent with cursor '${this.data.cursor}'; expected '${expectedStatus}'`);
    }
    return { ok: true };
  }

  currentCursor() {
    return this.data.cursor;
  }

  status() {
    return this.data.status;
  }

  hasOutput(stepId) {
    return Boolean(this.data.state && Object.hasOwn(this.data.state, stepId));
  }

  outputFor(stepId) {
    return this.data.state?.[stepId];
  }

  pendingRequests() {
    return this.data.requests ?? [];
  }

  withAppliedOutput(stepId, output, attempts, { mirrorToOutputs = false } = {}) {
    const baton = this.toJSON();
    const state = {
      ...baton.state,
      artifacts: mergeArtifacts(baton.state?.artifacts ?? [], aggregateArray(output, 'artifacts')),
      results: appendResults(baton.state?.results ?? [], aggregateArray(output, 'results')),
    };

    if (stepId) {
      state[stepId] = structuredClone(output);
      if (mirrorToOutputs) {
        state.outputs = {
          ...(baton.state?.outputs ?? {}),
          [stepId]: structuredClone(output),
        };
      }
    }

    if (attempts) state.attempts = attempts;
    return { ...baton, state };
  }
}

export function applyOutputToBatonState(baton, output, attempts, stepId, options = {}) {
  return new Baton(baton).withAppliedOutput(stepId, output, attempts, options).state;
}
