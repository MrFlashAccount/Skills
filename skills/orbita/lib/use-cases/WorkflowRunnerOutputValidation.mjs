/** Workflow-runner output validation policy over IO-free runtime helpers. */
import { validateAgainstOutputSchema } from './runtime/output/output-schema-validation.mjs';
import { workerOutputSchema } from './runtime/output/worker-output-schema.mjs';

export function validateRunnerAcceptedOutput({
  requestStepId,
  step,
  resources,
  requestAction,
  output,
  artifactPathErrors = [],
} = {}) {
  if (!step) throw new Error(`unknown current workflow step id: ${requestStepId}`);
  const schemaRef = step.output?.schema;
  const loaded = schemaRef
    ? (resources?.outputSchemas instanceof Map ? resources.outputSchemas.get(schemaRef) : resources?.outputSchemas?.[schemaRef])
    : undefined;
  const schema = schemaRef ? (loaded?.schema ?? loaded) : (requestAction === 'run_worker' ? workerOutputSchema : undefined);
  if (schemaRef && !schema) throw new Error(`output schema validation failed: missing output.schema '${schemaRef}'`);
  if (!schema) return output;
  const validation = validateAgainstOutputSchema({
    schemaRef: schemaRef ?? 'worker-output',
    schema,
    output,
    artifactPathErrors,
  });
  if (!validation.ok) throw new Error(`output schema validation failed for step '${requestStepId}': ${validation.errors}`);
  return validation.output;
}
