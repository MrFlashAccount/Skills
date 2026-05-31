import { WorkflowInterpreterError } from '../../errors.mjs';
import { templateResource, section, trimStable } from '../utils.mjs';

export function readOutputTemplate({ step, resources }) {
  const templateRef = step.output?.template;
  if (!templateRef) return { content: '', metadataPath: undefined };
  const resolved = templateResource(resources, templateRef, 'output');
  return { content: resolved.content, metadataPath: templateRef };
}

export function readOutputSchema({ step, resources }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) return { content: '', metadataPath: undefined, schema: undefined };
  const schemas = resources?.outputSchemas ?? resources?.outputSchemaByRef ?? {};
  const loaded = schemas instanceof Map ? schemas.get(schemaRef) : schemas[schemaRef];
  const schema = loaded?.schema ?? loaded;
  if (!schema) throw new WorkflowInterpreterError(`workflow prompt render failed: output.schema not found: ${schemaRef}`);
  return { content: JSON.stringify(schema, null, 2), metadataPath: schemaRef, schema };
}

export function finalOutputReminder(outputContract) {
  return outputContract ? section('Final reminder', 'Return exactly according to the output contract above.') : '';
}

export function outputContractSection(outputTemplate, templatePath, outputSchema, schemaPath) {
  if (!outputTemplate && !outputSchema) return '';
  const parts = [];
  if (outputTemplate) {
    const templateComment = templatePath ? `\n\n<!-- output template: ${templatePath} -->` : '';
    parts.push(`Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.${templateComment}\n\n${trimStable(outputTemplate)}`);
  }
  if (outputSchema) {
    const schemaComment = schemaPath ? `\n\n<!-- output schema: ${schemaPath} -->` : '';
    parts.push(`Return valid JSON matching this schema. If a validation command or tool is available in this agent/subagent context, validate the generated JSON against this schema before the final answer; fix validation errors and repeat for a bounded number of attempts. The harness/orchestrator will validate the final returned JSON again after the answer, so this agent-side validation is a preflight, not the final authority. If no validation command or tool is available in this context, still return strict schema-matching JSON and expect harness-level validation.${schemaComment}\n\n\`\`\`json\n${trimStable(outputSchema)}\n\`\`\``);
  }
  return section('Output contract', parts.join('\n\n'));
}
