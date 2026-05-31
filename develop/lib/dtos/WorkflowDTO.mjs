/** Boundary DTO for workflow file/API input. */
import { assertPlainObject, assertString, cloneFrozen } from './_dto-utils.mjs';

export class WorkflowDTO {
  constructor(data) {
    const workflow = assertPlainObject(data, 'WorkflowDTO');
    assertString(workflow.name, 'WorkflowDTO.name');
    assertString(workflow.start, 'WorkflowDTO.start');
    assertString(workflow.done, 'WorkflowDTO.done');
    assertString(workflow.blocked, 'WorkflowDTO.blocked');
    assertPlainObject(workflow.steps, 'WorkflowDTO.steps');
    this.data = cloneFrozen(workflow);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
