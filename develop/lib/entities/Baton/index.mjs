/**
 * Baton entity owns runtime cursor/status/state consistency and safe state updates.
 */
import { WorkflowRuntimeError } from '../../errors.mjs';
import { assertCentralArtifactMetadata } from './artifact-contract.mjs';
import { applyOutputToBatonState } from '../../runtime/baton-state.mjs';
import { statusForStep } from '../../runtime/step-status.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

function workflowData(workflow) {
  return typeof workflow?.toJSON === 'function' ? workflow.toJSON() : workflow;
}


function validateAggregateArtifacts(state) {
  if (!Array.isArray(state.artifacts)) throw new WorkflowRuntimeError('baton semantic validation failed: state.artifacts must be array');
  for (const [index, entry] of state.artifacts.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.producerStepId !== 'string' || !entry.producerStepId || !entry.artifact || typeof entry.artifact !== 'object' || Array.isArray(entry.artifact)) {
      throw new WorkflowRuntimeError(`baton semantic validation failed: state.artifacts/${index} must be aggregate artifact {producerStepId, artifact}`);
    }
    for (const field of Object.keys(entry)) {
      if (!['producerStepId', 'artifact'].includes(field)) throw new WorkflowRuntimeError(`baton semantic validation failed: state.artifacts/${index}/${field} is not allowed`);
    }
    assertCentralArtifactMetadata(entry.artifact, `state.artifacts/${index}/artifact`, { errorPrefix: 'baton semantic validation failed' });
  }
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
    if (typeof this.data.cursor !== 'string' || typeof this.data.status !== 'string' || !this.data.state || typeof this.data.state !== 'object' || Array.isArray(this.data.state)) {
      throw new WorkflowRuntimeError('baton semantic validation failed: baton requires cursor, status, and object state');
    }
    validateAggregateArtifacts(this.data.state);
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
    const state = applyOutputToBatonState(baton, output, attempts, stepId, { mirrorToOutputs });
    return { ...baton, state };
  }
}
