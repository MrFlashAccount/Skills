import { WorkflowRuntimeError } from '../../../../errors.mjs';
import { templateResource, section, trimStable } from '../utils.mjs';
import { artifactOutputFieldNotes } from './schema-field-notes.mjs';

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
  if (!schema) throw new WorkflowRuntimeError(`workflow prompt render failed: output.schema not found: ${schemaRef}`);
  return { content: JSON.stringify(schema, null, 2), metadataPath: schemaRef, schema };
}

export function finalOutputReminder(outputContract) {
  return outputContract ? section('Final reminder', 'Return exactly according to the output contract above.') : '';
}

function validatingWriterProtocol(command) {
  const trimmedCommand = typeof command === 'string' ? command.trim() : '';
  if (!trimmedCommand) {
    return 'Generate strict JSON matching this schema. No validating writer command is provided in these instructions, so do not invent one and do not create or hand off a separate JSON output path. Stop and report that the validating writer command is missing.';
  }
  return `Generate strict JSON matching this schema. Write the request output by calling this validating writer command. The command already contains the run id, step id, and lease token; only replace the JSON body/stdin content:\n\n\`\`\`bash\n${trimmedCommand}\n\`\`\`\n\nThe command validates against this request output schema and accepts the output directly into the run baton/state. If it fails with validation errors, fix the JSON and run the same command again. Repeat for a bounded number of attempts until it returns OK. Do not create a separate JSON output file and do not pass an output path to the orchestrator. Artifact content files are allowed and required when producing artifacts, but they must be handed off through the workflow artifacts metadata accepted into baton/state; do not create arbitrary temp/export files as substitutes for baton artifacts.`;
}

function artifactOutputDirectoryInstruction(artifactOutputDir) {
  const trimmedDir = typeof artifactOutputDir === 'string' ? artifactOutputDir.trim() : '';
  if (!trimmedDir) return '';
  return [
    `Artifact output directory for this step: ${trimmedDir}`,
    '- Write every generated artifact content file for this step inside that directory.',
    '- Use the artifact id as the artifact file name/stem unless the schema or step prompt is stricter.',
    '- Set artifacts[].path to the full absolute filesystem path of each created artifact file.',
    '- Do not use temp dirs, ad-hoc export paths, or paths outside the step artifact output directory.',
  ].join('\n');
}

export function outputContractSection(outputTemplate, templatePath, outputSchema, schemaPath, outputSchemaValue, options = {}) {
  if (!outputTemplate && !outputSchema) return '';
  const parts = [];
  if (outputTemplate) {
    const templateComment = templatePath ? `\n\n<!-- output template: ${templatePath} -->` : '';
    parts.push(`Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.${templateComment}\n\n${trimStable(outputTemplate)}`);
  }
  if (outputSchema) {
    const schemaComment = schemaPath ? `\n\n<!-- output schema: ${schemaPath} -->` : '';
    const artifactNotes = outputSchemaValue ? artifactOutputFieldNotes(outputSchemaValue, { schemaDefinitions: options.schemaDefinitions }) : '';
    const hasArtifactsOutput = Boolean(outputSchemaValue?.properties?.artifacts);
    const schemaParts = [];
    if (hasArtifactsOutput) {
      const artifactDirInstruction = artifactOutputDirectoryInstruction(options.artifactOutputDir);
      if (artifactDirInstruction) schemaParts.push(artifactDirInstruction);
    }
    if (artifactNotes) schemaParts.push(artifactNotes);
    schemaParts.push(`${validatingWriterProtocol(options.validatingWriterCommand)}${schemaComment}\n\n\`\`\`json\n${trimStable(outputSchema)}\n\`\`\``);
    parts.push(schemaParts.join('\n\n'));
  }
  return section('Output contract', parts.join('\n\n'));
}
