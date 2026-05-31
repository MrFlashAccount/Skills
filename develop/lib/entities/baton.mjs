/** Behavior wrapper over a baton DTO. */
export class Baton {
  constructor(dto) {
    this.dto = dto;
  }

  get cursor() { return this.dto?.cursor; }
  get status() { return this.dto?.status; }
  get state() { return this.dto?.state ?? {}; }
  get attempts() { return this.dto?.attempts ?? {}; }

  hasOutputFor(stepId) {
    return Object.hasOwn(this.state, stepId);
  }
}
