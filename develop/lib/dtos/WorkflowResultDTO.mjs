/**
 * Boundary DTO for workflow runtime data.
 * DTOs intentionally own cloning/shape transport only; entities own behavior.
 */
export class WorkflowResultDTO {
  constructor(data = {}) {
    this.data = structuredClone(data);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}

export function toWorkflowResultDTO(data) {
  return data instanceof WorkflowResultDTO ? data : new WorkflowResultDTO(data);
}
