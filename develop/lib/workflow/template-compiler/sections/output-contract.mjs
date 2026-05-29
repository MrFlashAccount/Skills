import path from 'node:path';
import { safeReadSchema, safeReadTemplate, section, trimStable, workflowSkillBase } from '../utils.mjs';
import { WorkflowInterpreterError } from '../../errors.mjs';

function outputBases({ workflow, workflowPath, repositoryRoot }) {
  const bases = [];
  const skillBase = workflowSkillBase({ workflow, repositoryRoot });
  if (skillBase) bases.push(skillBase);
  bases.push(repositoryRoot);
  if (workflowPath) bases.push(path.dirname(path.resolve(workflowPath)));
  return bases;
}

function outputAllowedRoots({ workflowPath, repositoryRoot }) {
  const roots = [repositoryRoot];
  if (workflowPath) roots.push(path.dirname(path.resolve(workflowPath)));
  return roots;
}

export function readOutputTemplate({ workflow, step, repositoryRoot }) {
  const templateRef = step.output?.template;
  if (!templateRef) return { content: '', metadataPath: undefined };
  const resolved = safeReadTemplate({ templateRef, fieldName: 'output', bases: outputBases({ workflow, repositoryRoot }), repositoryRoot });
  return { content: resolved.content, metadataPath: templateRef };
}

function parseOutputSchemaContent(schemaRef, content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new WorkflowInterpreterError(
      `workflow prompt render failed: invalid output schema JSON '${schemaRef}': ${error.message}`,
    );
  }
}

export function readOutputSchema({ workflow, workflowPath, step, repositoryRoot }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) return { content: '', metadataPath: undefined, schema: undefined };
  const resolved = safeReadSchema({
    schemaRef,
    fieldName: 'output',
    bases: outputBases({ workflow, workflowPath, repositoryRoot }),
    repositoryRoot,
    allowedRoots: outputAllowedRoots({ workflowPath, repositoryRoot }),
  });
  const schema = parseOutputSchemaContent(schemaRef, resolved.content);
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
