/**
 * Boundary DTO for workflow runtime data.
 * DTOs intentionally own cloning/shape transport only; entities own behavior.
 */
export class OutputDTO {
  constructor(data = {}) {
    this.data = structuredClone(data);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}

export function toOutputDTO(data) {
  return data instanceof OutputDTO ? data : new OutputDTO(data);
}
