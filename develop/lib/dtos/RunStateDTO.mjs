/**
 * Boundary DTO for workflow runtime data.
 * DTOs intentionally own cloning/shape transport only; entities own behavior.
 */
export class RunStateDTO {
  constructor(data = {}) {
    this.data = structuredClone(data);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}

export function toRunStateDTO(data) {
  return data instanceof RunStateDTO ? data : new RunStateDTO(data);
}
