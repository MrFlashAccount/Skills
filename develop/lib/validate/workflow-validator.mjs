import { validateJsonSchema } from 'schema-validation';
import { WorkflowInterpreterError } from '../workflow/errors.mjs';
import { readJson } from '../workflow/json-io.mjs';
import { RESERVED_STEP_IDS, assertProjectableStateSelector, isReservedStateKey } from '../workflow/state-keys.mjs';
import { readOutputSchema } from '../workflow/output-schema-validation.mjs';
import { assertRoleDirectoryName, listAllowedWorkflowRoles } from '../workflow/roles.mjs';
import { assertWorkflowSchema, workflowSchemas } from '../workflow/schema-validation.mjs';
import { assertTransitionDescriptorTargets, normalizeTransitionNext } from '../workflow/transitions.mjs';

const WORKFLOW_NAME = /^[a-z][a-z0-9-]*$/;

function fail(message) {
  throw new WorkflowInterpreterError(`workflow semantic validation failed: ${message}`);
}

function fieldPath(...parts) {
  return parts.filter((part) => part !== undefined && part !== '').join('.');
}

function assertWorkflowRootTargets(workflow) {
  const startStep = workflow.steps[workflow.start];
  if (!startStep) fail(`workflow start target not found: ${workflow.start}`);

  const doneStep = workflow.steps[workflow.done];
  if (!doneStep) fail(`workflow done target not found: ${workflow.done}`);
  if (doneStep.kind !== 'done') fail(`workflow done target '${workflow.done}' must be a done step`);

  const blockedStep = workflow.steps[workflow.blocked];
  if (!blockedStep) fail(`workflow blocked target not found: ${workflow.blocked}`);
  if (blockedStep.kind !== 'blocked') fail(`workflow blocked target '${workflow.blocked}' must be a blocked step`);
}

function assertWorkflowIdentity(workflow) {
  if (typeof workflow.name !== 'string' || !WORKFLOW_NAME.test(workflow.name)) {
    fail(`workflow name must be a non-empty lowercase kebab-case identifier: ${JSON.stringify(workflow.name)}`);
  }
}

function assertWorkflowStepIds(workflow) {
  for (const stepId of Object.keys(workflow.steps)) {
    if (isReservedStateKey(stepId)) {
      fail(`workflow step id '${stepId}' is reserved for runtime aggregate state; reserved ids: ${RESERVED_STEP_IDS.join(', ')}`);
    }
  }
}

function assertWorkflowInputStateSelectors(workflow) {
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    for (const selector of step.input?.state ?? []) {
      try {
        assertProjectableStateSelector(selector, { stepId, errorPrefix: 'workflow semantic validation failed' });
      } catch (error) {
        if (!(error instanceof WorkflowInterpreterError)) throw error;
        if (!/top-level workflow step ids only/.test(error.message)) {
          fail(`step '${stepId}' input.state selector '${selector}' is reserved for runtime aggregate state and cannot reference workflow steps`);
        }
        fail(`step '${stepId}' input.state selector '${selector}' is invalid; v1 supports top-level workflow step ids only`);
      }
      if (!Object.hasOwn(workflow.steps, selector)) {
        fail(`step '${stepId}' input.state selector '${selector}' does not reference a declared workflow step`);
      }
    }
  }
}

function assertWorkflowStepRoles(workflow, repositoryRoot) {
  const allowedRoles = new Set(listAllowedWorkflowRoles({ repositoryRoot }));
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    if (step.kind !== 'worker') continue;
    const role = step.input?.role;
    if (!role) continue;
    try {
      assertRoleDirectoryName(role);
    } catch (error) {
      if (error instanceof WorkflowInterpreterError) fail(`step '${stepId}' ${error.message.replace(/^workflow role validation failed: /, '')}`);
      throw error;
    }
    if (!allowedRoles.has(role)) {
      const expected = [...allowedRoles].join(', ');
      fail(`step '${stepId}' input.role '${role}' is not an allowed role${expected ? `; expected one of: ${expected}` : ''}`);
    }
  }
}

function isDevHarnessOutputSchema(schemaRef, schema) {
  return (typeof schemaRef === 'string' && schemaRef.includes('/schemas/dev-harness/'))
    || (typeof schema?.$id === 'string' && schema.$id.includes('/schemas/workflow/dev-harness/'));
}

function collectFieldAnnotationWarnings(schema, schemaRef, warnings, pathSegments = []) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;

  const hasFieldNote = typeof schema.description === 'string' || typeof schema['x-usage'] === 'string';
  if (hasFieldNote && pathSegments.length > 0 && typeof schema.description === 'string' && typeof schema['x-usage'] !== 'string') {
    warnings.push(`output.schema '${schemaRef}' field '${fieldPath(...pathSegments)}' has description but no x-usage receiver instruction`);
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
      if (propertyName === 'x-usage') continue;
      collectFieldAnnotationWarnings(propertySchema, schemaRef, warnings, [...pathSegments, propertyName]);
    }
  }
  if (schema.$defs && typeof schema.$defs === 'object') {
    for (const [defName, defSchema] of Object.entries(schema.$defs)) {
      collectFieldAnnotationWarnings(defSchema, schemaRef, warnings, [...pathSegments, '$defs', defName]);
    }
  }
  if (schema.items) collectFieldAnnotationWarnings(schema.items, schemaRef, warnings, [...pathSegments, 'items']);
}

function validateOutputSchemaDocument(schema, schemaRef, workflow, workflowPath, repositoryRoot, warnings) {
  let validation;
  try {
    validation = validateJsonSchema(schema, {}, { schemas: workflowSchemas });
  } catch (error) {
    fail(`output.schema '${schemaRef}' is not a valid JSON Schema: ${error.message}`);
  }
  // Validation result is irrelevant here: compiling the schema is the check.
  void validation;
  if (isDevHarnessOutputSchema(schemaRef, schema)) collectFieldAnnotationWarnings(schema, schemaRef, warnings);
}

function loadStepOutputSchemas({ workflow, workflowPath, repositoryRoot, warnings }) {
  const schemasByStep = new Map();
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    const schemaRef = step.output?.schema;
    if (!schemaRef) continue;
    let schema;
    try {
      schema = readOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot });
    } catch (error) {
      if (error instanceof WorkflowInterpreterError) fail(`step '${stepId}' ${error.message}`);
      throw error;
    }
    validateOutputSchemaDocument(schema, schemaRef, workflow, workflowPath, repositoryRoot, warnings);
    schemasByStep.set(stepId, schema);
  }
  return schemasByStep;
}

function schemaVariants(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const variants = [schema];
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[key])) variants.push(...schema[key].flatMap((item) => schemaVariants(item)));
  }
  return variants;
}

function schemaForPath(schema, pathSegments) {
  let candidates = [schema];
  for (const segment of pathSegments) {
    const nextCandidates = [];
    for (const candidate of candidates.flatMap((item) => schemaVariants(item))) {
      const propertySchema = candidate?.properties?.[segment];
      if (propertySchema) nextCandidates.push(propertySchema);
    }
    candidates = nextCandidates;
    if (candidates.length === 0) return [];
  }
  return candidates.flatMap((item) => schemaVariants(item));
}

function collectStringValues(schema, values = new Set()) {
  for (const candidate of schemaVariants(schema)) {
    if (typeof candidate.const === 'string') values.add(candidate.const);
    if (Array.isArray(candidate.enum)) {
      for (const value of candidate.enum) if (typeof value === 'string') values.add(value);
    }
  }
  return values;
}

function possibleStringTargetsForSchema(schema) {
  const directValues = collectStringValues(schema);
  const itemValues = new Set();
  const arraySchemas = [];
  for (const candidate of schemaVariants(schema)) {
    if (candidate.type === 'array' || candidate.items) {
      arraySchemas.push(candidate);
      collectStringValues(candidate.items, itemValues);
    }
  }

  return { directValues, itemValues, arraySchemas, possible: new Set([...directValues, ...itemValues]) };
}

function schemaForExpression({ workflow, schemasByStep, stepId, step, expression }) {
  if (expression.root === 'output') {
    const schema = schemasByStep.get(stepId);
    if (!schema) return { schema: undefined, reason: `step '${stepId}' has no output.schema for ${expression.source}` };
    return { schema: schemaForPath(schema, expression.path), reason: undefined };
  }

  const [stateKey, ...rest] = expression.path;
  const projectedState = step.input?.state ?? [];
  if (!projectedState.includes(stateKey)) {
    return { schema: undefined, reason: `step '${stepId}' does not project input state '${stateKey}' for ${expression.source}` };
  }
  const producerSchema = schemasByStep.get(stateKey);
  if (!producerSchema) return { schema: undefined, reason: `projected input '${stateKey}' has no output.schema for ${expression.source}` };
  return { schema: schemaForPath(producerSchema, rest), reason: undefined };
}

function approvalOutputExpressionMayBeUnchecked({ schemasByStep, stepId, step, expression }) {
  return step.kind === 'approval' && expression.root === 'output' && !schemasByStep.has(stepId);
}

function assertExpressionSchemaAvailable({ workflow, schemasByStep, stepId, step, expression, field }) {
  const resolved = schemaForExpression({ workflow, schemasByStep, stepId, step, expression });
  if (!resolved.schema || resolved.schema.length === 0) {
    if (approvalOutputExpressionMayBeUnchecked({ schemasByStep, stepId, step, expression })) return undefined;
    fail(`step '${stepId}' ${field} expression ${expression.source} has no schema-covered path (${resolved.reason ?? 'path not found'})`);
  }
  return resolved.schema;
}

function assertDynamicTargetSchema({ workflow, schemasByStep, stepId, step, expression, field }) {
  const schemas = assertExpressionSchemaAvailable({ workflow, schemasByStep, stepId, step, expression, field });
  if (!schemas) return;
  const aggregate = schemas.reduce((acc, schema) => {
    const next = possibleStringTargetsForSchema(schema);
    for (const value of next.possible) acc.possible.add(value);
    for (const value of next.directValues) acc.directValues.add(value);
    for (const value of next.itemValues) acc.itemValues.add(value);
    acc.arraySchemas.push(...next.arraySchemas);
    return acc;
  }, { possible: new Set(), directValues: new Set(), itemValues: new Set(), arraySchemas: [] });

  if (aggregate.possible.size === 0) fail(`step '${stepId}' ${field} expression ${expression.source} must resolve from a string enum/const or array item enum/const schema`);

  for (const target of aggregate.directValues) {
    if (!Object.hasOwn(workflow.steps, target)) fail(`step '${stepId}' ${field} expression ${expression.source} schema allows unknown target '${target}'`);
  }
  if (aggregate.itemValues.size === 0) return;

  for (const arraySchema of aggregate.arraySchemas) {
    if (arraySchema.minItems === undefined || arraySchema.minItems < 1) {
      fail(`step '${stepId}' ${field} expression ${expression.source} array target schema must declare minItems >= 1`);
    }
    if (arraySchema.uniqueItems !== true) {
      fail(`step '${stepId}' ${field} expression ${expression.source} array target schema must declare uniqueItems: true`);
    }
  }

  try {
    assertTransitionDescriptorTargets(workflow, stepId, { kind: 'static-parallel', targets: [...aggregate.itemValues] });
  } catch (error) {
    if (error instanceof WorkflowInterpreterError) fail(`step '${stepId}' ${field} expression ${expression.source} array target schema is not a valid parallel fan-out: ${error.message}`);
    throw error;
  }
}

function assertMatchCasesSchema({ workflow, schemasByStep, stepId, step, descriptor, field }) {
  const schemas = assertExpressionSchemaAvailable({ workflow, schemasByStep, stepId, step, expression: descriptor.expression, field });
  if (!schemas) return;
  const possibleCaseKeys = new Set();
  for (const schema of schemas) collectStringValues(schema, possibleCaseKeys);

  if (possibleCaseKeys.size === 0) fail(`step '${stepId}' ${field}.match expression ${descriptor.expression.source} must resolve from a string enum/const schema`);
  for (const key of possibleCaseKeys) {
    if (!Object.hasOwn(descriptor.cases, key)) fail(`step '${stepId}' ${field}.cases is missing schema-declared case '${key}'`);
  }
  for (const key of Object.keys(descriptor.cases)) {
    if (!possibleCaseKeys.has(key)) fail(`step '${stepId}' ${field}.cases declares unreachable case '${key}' not present in the selector schema`);
  }
}

function assertTransitionSemantics(workflow, schemasByStep) {
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    if (!Object.hasOwn(step, 'next')) continue;
    let descriptor;
    try {
      descriptor = normalizeTransitionNext(step.next);
      assertTransitionDescriptorTargets(workflow, stepId, descriptor);
    } catch (error) {
      if (error instanceof WorkflowInterpreterError) fail(error.message);
      throw error;
    }

    if (descriptor.kind === 'dynamic-target') {
      assertDynamicTargetSchema({ workflow, schemasByStep, stepId, step, expression: descriptor.expression, field: 'next' });
      continue;
    }
    if (descriptor.kind === 'match-cases') {
      assertMatchCasesSchema({ workflow, schemasByStep, stepId, step, descriptor, field: 'next' });
      continue;
    }
    if (descriptor.kind === 'parallel-items') {
      for (const [index, item] of descriptor.items.entries()) {
        if (item.kind === 'dynamic-target') {
          assertDynamicTargetSchema({ workflow, schemasByStep, stepId, step, expression: item.expression, field: fieldPath('next', index) });
        } else if (item.kind === 'match-cases') {
          assertMatchCasesSchema({ workflow, schemasByStep, stepId, step, descriptor: item, field: fieldPath('next', index) });
        }
      }
    }
  }
}

export function validateWorkflowDocument(workflowDoc, { workflowPath = 'workflow.json', repositoryRoot = process.cwd() } = {}) {
  assertWorkflowSchema(workflowDoc);
  const workflow = workflowDoc.workflow;
  assertWorkflowIdentity(workflow);
  assertWorkflowStepIds(workflow);
  assertWorkflowRootTargets(workflow);
  assertWorkflowInputStateSelectors(workflow);
  assertWorkflowStepRoles(workflow, repositoryRoot);
  const warnings = [];
  const schemasByStep = loadStepOutputSchemas({ workflow, workflowPath, repositoryRoot, warnings });
  assertTransitionSemantics(workflow, schemasByStep);
  const result = { ok: true, workflow: workflow.name, steps: Object.keys(workflow.steps).length };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  return validateWorkflowDocument(workflowDoc, { ...options, workflowPath });
}
