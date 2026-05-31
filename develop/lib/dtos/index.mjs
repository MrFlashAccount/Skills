/**
 * Workflow runtime DTOs are plain boundary documents. They intentionally carry
 * no behavior; schemas and persistence readers validate/produce these shapes.
 */
export const DTO_KIND = Object.freeze({
  workflow: 'workflow',
  baton: 'baton',
  step: 'step',
  template: 'template',
  workerOutput: 'worker-output',
  interpreterResponse: 'workflow-interpreter-response',
});

export function asWorkflowDTO(value) { return value; }
export function asBatonDTO(value) { return value; }
export function asStepDTO(value) { return value; }
export function asTemplateDTO(value) { return value; }
export function asWorkerOutputDTO(value) { return value; }
export function asInterpreterResponseDTO(value) { return value; }
