/**
 * Boundary DTO for workflow runtime data.
 * DTOs intentionally own cloning/shape transport only; entities own behavior.
 */
export class BatonDTO {
  constructor(data = {}) {
    this.data = structuredClone(data);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}

export function toBatonDTO(data) {
  return data instanceof BatonDTO ? data : new BatonDTO(data);
}
