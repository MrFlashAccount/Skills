/**
 * Boundary DTO for workflow runtime data.
 * DTOs intentionally own cloning/shape transport only; entities own behavior.
 */
export class StepDTO {
  constructor(data = {}) {
    this.data = structuredClone(data);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}

export function toStepDTO(data) {
  return data instanceof StepDTO ? data : new StepDTO(data);
}
