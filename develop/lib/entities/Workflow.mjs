/**
 * Workflow entity owns workflow-level validation, topology, step lookup, and cursor inference.
 * It accepts boundary DTO data and never reads files or parses CLI arguments.
 */
import { validateJsonSchema } from 'schema-validation';
import { WorkflowRuntimeError } from './errors.mjs';
import { RESERVED_STATE_KEYS, DANGEROUS_OBJECT_KEYS, assertProjectableStateSelector, isDangerousObjectKey, isReservedStateKey } from './workflow-helpers/state-keys.mjs';
import { assertRoleDirectoryName } from './workflow-helpers/roles.mjs';
import { assertWorkflowSchema, workflowSchemas } from '../entities/workflow-helpers/schema-validation.mjs';
import { assertTransitionDescriptorTargets, normalizeTransitionNext } from './Step.mjs';
import { Step } from './Step.mjs';
import { statusForStep } from './workflow-helpers/model.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

const WORKFLOW_NAME = /^[a-z][a-z0-9-]*$/;

function fail(message) {
  throw new WorkflowRuntimeError(`workflow semantic validation failed: ${message}`);
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
      fail(`workflow step id '${stepId}' is reserved for runtime aggregate state; reserved ids: ${RESERVED_STATE_KEYS.join(', ')}`);
    }
    if (isDangerousObjectKey(stepId)) {
      fail(`workflow step id '${stepId}' is reserved because it is unsafe as a JavaScript object key; reserved ids: ${DANGEROUS_OBJECT_KEYS.join(', ')}`);
    }
  }
}

function assertWorkflowInputStateSelectors(workflow) {
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    for (const selector of step.input?.state ?? []) {
      try {
        assertProjectableStateSelector(selector, { stepId, errorPrefix: 'workflow semantic validation failed' });
      } catch (error) {
        if (!(error instanceof WorkflowRuntimeError)) throw error;
        if (!/top-level workflow step ids only/.test(error.message)) {
          if (isDangerousObjectKey(selector)) fail(`step '${stepId}' input.state selector '${selector}' is unsafe as a JavaScript object key and cannot reference workflow steps; reserved state selector '${selector}' is unsafe`);
          fail(`step '${stepId}' input.state selector '${selector}' uses reserved state selector '${selector}'; selector is reserved for runtime aggregate state and cannot reference workflow steps`);
        }
        fail(`step '${stepId}' input.state selector '${selector}' is invalid; v1 supports top-level workflow step ids only`);
      }
      if (!Object.hasOwn(workflow.steps, selector)) {
        fail(`step '${stepId}' input.state selector '${selector}' does not reference a declared workflow step`);
      }
    }
  }
}

function assertWorkflowStepRoles(workflow, allowedRoleNames = []) {
  const allowedRoles = new Set(allowedRoleNames);
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    if (step.kind !== 'worker') continue;
    const role = step.input?.role;
    if (!role) continue;
    try {
      assertRoleDirectoryName(role);
    } catch (error) {
      if (error instanceof WorkflowRuntimeError) fail(`step '${stepId}' ${error.message.replace(/^workflow role validation failed: /, '')}`);
      throw error;
    }
    if (allowedRoles.size > 0 && !allowedRoles.has(role)) {
      const expected = [...allowedRoles].join(', ');
      fail(`step '${stepId}' input.role '${role}' is not an allowed role${expected ? `; expected one of: ${expected}` : ''}`);
    }
  }
}

function isDevHarnessOutputSchema(schemaRef, schema) {
  return (typeof schemaRef === 'string' && schemaRef.includes('workflows/dev-harness/schemas/'))
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

function decodeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveLocalSchemaRef(rootSchema, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  if (ref === '#') return rootSchema;
  if (!ref.startsWith('#/')) return undefined;

  let current = rootSchema;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = decodeJsonPointerSegment(rawSegment);
    if (!current || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function normalizeSchemaForSemanticIntrospection(schema, rootSchema = schema, refStack = []) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;

  let baseSchema = {};
  if (typeof schema.$ref === 'string') {
    if (refStack.includes(schema.$ref)) {
      fail(`output.schema contains circular local $ref: ${[...refStack, schema.$ref].join(' -> ')}`);
    }
    const resolved = resolveLocalSchemaRef(rootSchema, schema.$ref);
    if (resolved) {
      baseSchema = normalizeSchemaForSemanticIntrospection(resolved, rootSchema, [...refStack, schema.$ref]);
    }
  }

  const normalized = { ...baseSchema };
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref') continue;
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) => normalizeSchemaForSemanticIntrospection(item, rootSchema, refStack));
    } else if (value && typeof value === 'object') {
      const objectValue = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        objectValue[childKey] = normalizeSchemaForSemanticIntrospection(childValue, rootSchema, refStack);
      }
      normalized[key] = objectValue;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function validateOutputSchemaDocument(schema, schemaRef, workflow, _runtimeContext, warnings, { stepId, step, requireWorkerOutcomeContract = true } = {}) {
  let validation;
  try {
    validation = validateJsonSchema(schema, {}, { schemas: workflowSchemas });
  } catch (error) {
    fail(`output.schema '${schemaRef}' is not a valid JSON Schema: ${error.message}`);
  }
  // Validation result is irrelevant here: compiling the schema is the check.
  void validation;

  const normalizedSchema = normalizeSchemaForSemanticIntrospection(schema);
  if (requireWorkerOutcomeContract && step?.kind === 'worker') assertWorkerOutputSchemaContract({ stepId, schema: normalizedSchema });
  if (isDevHarnessOutputSchema(schemaRef, schema)) collectFieldAnnotationWarnings(schema, schemaRef, warnings);
  return normalizedSchema;
}

function outputSchemaForStep(outputSchemas, stepId, schemaRef) {
  const loaded = outputSchemas instanceof Map ? outputSchemas.get(stepId) ?? outputSchemas.get(schemaRef) : outputSchemas?.[stepId] ?? outputSchemas?.[schemaRef];
  return loaded?.schema ?? loaded;
}

function normalizeStepOutputSchemas({ workflow, outputSchemas = new Map(), warnings, requireSchemaPresence = true, requireWorkerOutcomeContract = true }) {
  const schemasByStep = new Map();
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    const schemaRef = step.output?.schema;
    if (!schemaRef) continue;
    const schema = outputSchemaForStep(outputSchemas, stepId, schemaRef);
    if (!schema) {
      if (requireSchemaPresence) fail(`step '${stepId}' output.schema '${schemaRef}' was not provided to Workflow.validate()`);
      continue;
    }
    const normalizedSchema = validateOutputSchemaDocument(schema, schemaRef, workflow, undefined, warnings, { stepId, step, requireWorkerOutcomeContract });
    schemasByStep.set(stepId, normalizedSchema);
  }
  return schemasByStep;
}

function schemaRequiresPath(schema, pathSegments) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || pathSegments.length === 0) return false;
  const [segment, ...rest] = pathSegments;

  const directRequired = Array.isArray(schema.required)
    && schema.required.includes(segment)
    && schema.properties
    && typeof schema.properties === 'object'
    && Object.hasOwn(schema.properties, segment)
    && (rest.length === 0 || schemaRequiresPath(schema.properties[segment], rest));

  const allOfRequired = Array.isArray(schema.allOf) && schema.allOf.some((item) => schemaRequiresPath(item, pathSegments));
  const oneOfRequired = Array.isArray(schema.oneOf) && schema.oneOf.length > 0 && schema.oneOf.every((item) => schemaRequiresPath(item, pathSegments));
  const anyOfRequired = Array.isArray(schema.anyOf) && schema.anyOf.length > 0 && schema.anyOf.every((item) => schemaRequiresPath(item, pathSegments));

  return directRequired || allOfRequired || oneOfRequired || anyOfRequired;
}

function schemaAllowsNonString(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return true;
  if (schema.const !== undefined) return typeof schema.const !== 'string';
  if (Array.isArray(schema.enum)) return schema.enum.some((value) => typeof value !== 'string');
  if (schema.type !== undefined) {
    if (schema.type === 'string') return false;
    if (Array.isArray(schema.type)) return schema.type.some((type) => type !== 'string');
    return true;
  }
  if (Array.isArray(schema.allOf)) return schema.allOf.every((item) => schemaAllowsNonString(item));
  if (Array.isArray(schema.oneOf)) return schema.oneOf.some((item) => schemaAllowsNonString(item));
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some((item) => schemaAllowsNonString(item));
  return true;
}

function assertSchemaRequiresExpressionPath({ stepId, expression, field, rootSchema, pathSegments = expression.path }) {
  if (!schemaRequiresPath(rootSchema, pathSegments)) {
    fail(`step '${stepId}' ${field} expression ${expression.source} must reference a required output.schema path`);
  }
}

function assertWorkerOutputSchemaContract({ stepId, schema }) {
  if (!schemaRequiresPath(schema, ['outcome'])) {
    fail(`step '${stepId}' output.schema must require string field 'outcome' for worker outputs`);
  }
  const outcomeSchemas = schemaForPath(schema, ['outcome']);
  if (outcomeSchemas.length === 0 || outcomeSchemas.some((outcomeSchema) => schemaAllowsNonString(outcomeSchema))) {
    fail(`step '${stepId}' output.schema field 'outcome' must allow only strings`);
  }
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


function mergeSelectorAnalysis(target, source) {
  for (const value of source.directValues) target.directValues.add(value);
  for (const value of source.itemValues) target.itemValues.add(value);
  target.arraySchemas.push(...source.arraySchemas);
  return target;
}

function selectorAnalysis({ directValues = new Set(), itemValues = new Set(), arraySchemas = [] } = {}) {
  return { directValues, itemValues, arraySchemas };
}

function assertClosedStringValueSchema(schema, errorContext) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    fail(`${errorContext} must resolve from a closed string enum/const schema`);
  }
  if (schema.const !== undefined) {
    if (typeof schema.const !== 'string') fail(`${errorContext} schema allows non-string value ${JSON.stringify(schema.const)}`);
    return selectorAnalysis({ directValues: new Set([schema.const]) });
  }
  if (Array.isArray(schema.enum)) {
    if (schema.enum.length === 0) fail(`${errorContext} enum schema must declare at least one string value`);
    for (const value of schema.enum) {
      if (typeof value !== 'string') fail(`${errorContext} schema allows non-string value ${JSON.stringify(value)}`);
    }
    return selectorAnalysis({ directValues: new Set(schema.enum) });
  }
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = schema.anyOf ?? schema.oneOf;
    if (variants.length === 0) fail(`${errorContext} union schema must declare at least one closed string enum/const branch`);
    return variants.reduce((acc, variant) => mergeSelectorAnalysis(acc, assertClosedStringValueSchema(variant, errorContext)), selectorAnalysis());
  }
  if (Array.isArray(schema.allOf)) {
    const finiteBranches = schema.allOf
      .map((variant) => {
        try {
          return assertClosedStringValueSchema(variant, errorContext);
        } catch (error) {
          if (error instanceof WorkflowRuntimeError && /open string schema|must resolve from a closed string enum\/const schema/.test(error.message)) return undefined;
          throw error;
        }
      })
      .filter(Boolean);
    if (finiteBranches.length === 0) fail(`${errorContext} must resolve from a closed string enum/const schema`);
    return finiteBranches.reduce((acc, branch) => mergeSelectorAnalysis(acc, branch), selectorAnalysis());
  }
  if (schema.type === 'string' || (Array.isArray(schema.type) && schema.type.includes('string'))) {
    fail(`${errorContext} open string schema must be constrained with enum or const values`);
  }
  if (schema.type !== undefined) fail(`${errorContext} schema allows non-string type ${JSON.stringify(schema.type)}`);
  fail(`${errorContext} must resolve from a closed string enum/const schema`);
}

function assertClosedDynamicTargetSchema(schema, errorContext) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    fail(`${errorContext} must resolve from a closed string enum/const or array item enum/const schema`);
  }
  if (schema.type === 'array' || schema.items) {
    const itemAnalysis = assertClosedStringValueSchema(schema.items, `${errorContext} array item`);
    return selectorAnalysis({ itemValues: itemAnalysis.directValues, arraySchemas: [schema] });
  }
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = schema.anyOf ?? schema.oneOf;
    if (variants.length === 0) fail(`${errorContext} union schema must declare at least one closed string enum/const or array item enum/const branch`);
    return variants.reduce((acc, variant) => mergeSelectorAnalysis(acc, assertClosedDynamicTargetSchema(variant, errorContext)), selectorAnalysis());
  }
  if (Array.isArray(schema.allOf)) {
    const finiteBranches = schema.allOf
      .map((variant) => {
        try {
          return assertClosedDynamicTargetSchema(variant, errorContext);
        } catch (error) {
          if (error instanceof WorkflowRuntimeError && /open string schema|must resolve from a closed string enum\/const/.test(error.message)) return undefined;
          throw error;
        }
      })
      .filter(Boolean);
    if (finiteBranches.length === 0) fail(`${errorContext} must resolve from a closed string enum/const or array item enum/const schema`);
    return finiteBranches.reduce((acc, branch) => mergeSelectorAnalysis(acc, branch), selectorAnalysis());
  }
  return assertClosedStringValueSchema(schema, errorContext);
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
    return { schema: schemaForPath(schema, expression.path), rootSchema: schema, requiredPath: expression.path, reason: undefined };
  }

  const [stateKey, ...rest] = expression.path;
  const projectedState = step.input?.state ?? [];
  if (!projectedState.includes(stateKey)) {
    return { schema: undefined, reason: `step '${stepId}' does not project input state '${stateKey}' for ${expression.source}` };
  }
  const producerSchema = schemasByStep.get(stateKey);
  if (!producerSchema) return { schema: undefined, reason: `projected input '${stateKey}' has no output.schema for ${expression.source}` };
  return { schema: schemaForPath(producerSchema, rest), rootSchema: producerSchema, requiredPath: rest, reason: undefined };
}

function approvalOutputExpressionMayBeUnchecked({ schemasByStep, stepId, step, expression }) {
  return step.kind === 'approval' && expression.root === 'output' && !schemasByStep.has(stepId);
}

function assertExpressionSchemaAvailable({ workflow, schemasByStep, stepId, step, expression, field, requireSchemaCoverage = true }) {
  const resolved = schemaForExpression({ workflow, schemasByStep, stepId, step, expression });
  if (!resolved.schema || resolved.schema.length === 0) {
    if (!requireSchemaCoverage) return undefined;
    if (approvalOutputExpressionMayBeUnchecked({ schemasByStep, stepId, step, expression })) return undefined;
    fail(`step '${stepId}' ${field} expression ${expression.source} has no schema-covered path (${resolved.reason ?? 'path not found'})`);
  }
  return resolved;
}

function assertDynamicTargetSchema({ workflow, schemasByStep, stepId, step, expression, field, requireSchemaCoverage = true, requireExpressionRequiredPaths = true, allowOpenTransitionSchemas = false }) {
  const resolved = assertExpressionSchemaAvailable({ workflow, schemasByStep, stepId, step, expression, field, requireSchemaCoverage });
  if (!resolved) return;
  if (requireExpressionRequiredPaths) assertSchemaRequiresExpressionPath({ stepId, expression, field, rootSchema: resolved.rootSchema, pathSegments: resolved.requiredPath });
  let aggregate;
  try {
    aggregate = resolved.schema.reduce((acc, schema) => mergeSelectorAnalysis(acc, assertClosedDynamicTargetSchema(schema, `step '${stepId}' ${field} expression ${expression.source}`)), selectorAnalysis());
  } catch (error) {
    if (allowOpenTransitionSchemas && error instanceof WorkflowRuntimeError) return undefined;
    throw error;
  }

  for (const target of aggregate.directValues) {
    if (!Object.hasOwn(workflow.steps, target)) fail(`step '${stepId}' ${field} expression ${expression.source} schema allows unknown target '${target}'`);
  }
  if (aggregate.itemValues.size === 0) return aggregate;

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
    if (error instanceof WorkflowRuntimeError) fail(`step '${stepId}' ${field} expression ${expression.source} array target schema is not a valid parallel fan-out: ${error.message}`);
    throw error;
  }

  return aggregate;
}

function assertMatchCasesSchema({ workflow, schemasByStep, stepId, step, descriptor, field, requireSchemaCoverage = true, requireExpressionRequiredPaths = true, allowUnreachableCases = false, allowOpenTransitionSchemas = false }) {
  const resolved = assertExpressionSchemaAvailable({ workflow, schemasByStep, stepId, step, expression: descriptor.expression, field, requireSchemaCoverage });
  if (!resolved) return;
  if (requireExpressionRequiredPaths) assertSchemaRequiresExpressionPath({ stepId, expression: descriptor.expression, field: `${field}.match`, rootSchema: resolved.rootSchema, pathSegments: resolved.requiredPath });
  let possibleCaseKeys;
  try {
    const aggregate = resolved.schema.reduce((acc, schema) => mergeSelectorAnalysis(acc, assertClosedStringValueSchema(schema, `step '${stepId}' ${field}.match expression ${descriptor.expression.source}`)), selectorAnalysis());
    possibleCaseKeys = aggregate.directValues;
  } catch (error) {
    if (allowOpenTransitionSchemas && error instanceof WorkflowRuntimeError) return undefined;
    throw error;
  }
  for (const key of possibleCaseKeys) {
    if (!Object.hasOwn(descriptor.cases, key)) fail(`step '${stepId}' ${field}.cases is missing schema-declared case '${key}'`);
  }
  if (!allowUnreachableCases) {
    for (const key of Object.keys(descriptor.cases)) {
      if (!possibleCaseKeys.has(key)) fail(`step '${stepId}' ${field}.cases declares unreachable case '${key}' not present in the selector schema`);
    }
  }

  return possibleCaseKeys;
}

function targetSetsForMatchCases(possibleCaseKeys, cases) {
  return [...possibleCaseKeys].map((key) => {
    const target = cases[key];
    return typeof target === 'string' ? [target] : [...target];
  });
}

function targetSetsForDynamicTarget(aggregate) {
  const sets = [...aggregate.directValues].map((target) => [target]);
  if (aggregate.itemValues.size > 0) sets.push([...aggregate.itemValues]);
  return sets;
}

function combineTargetSets(leftSets, rightSets) {
  const combined = [];
  for (const left of leftSets) {
    for (const right of rightSets) combined.push([...left, ...right]);
  }
  return combined;
}

function assertParallelItemCombinations({ workflow, stepId, itemTargetSets }) {
  let combinations = [[]];
  for (const targetSets of itemTargetSets) combinations = combineTargetSets(combinations, targetSets);
  for (const targets of combinations) {
    try {
      assertTransitionDescriptorTargets(workflow, stepId, { kind: 'static-parallel', targets });
    } catch (error) {
      if (error instanceof WorkflowRuntimeError) fail(`step '${stepId}' next combined parallel targets are invalid: ${error.message}`);
      throw error;
    }
  }
}

function assertTransitionSemantics(workflow, schemasByStep, { requireSchemaCoverage = true, requireExpressionRequiredPaths = true, allowUnreachableCases = false, allowOpenTransitionSchemas = false } = {}) {
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    if (!Object.hasOwn(step, 'next')) continue;
    let descriptor;
    try {
      descriptor = normalizeTransitionNext(step.next);
      assertTransitionDescriptorTargets(workflow, stepId, descriptor);
    } catch (error) {
      if (error instanceof WorkflowRuntimeError) fail(error.message);
      throw error;
    }

    if (descriptor.kind === 'dynamic-target') {
      assertDynamicTargetSchema({ workflow, schemasByStep, stepId, step, expression: descriptor.expression, field: 'next', requireSchemaCoverage, requireExpressionRequiredPaths, allowOpenTransitionSchemas });
      continue;
    }
    if (descriptor.kind === 'match-cases') {
      assertMatchCasesSchema({ workflow, schemasByStep, stepId, step, descriptor, field: 'next', requireSchemaCoverage, requireExpressionRequiredPaths, allowUnreachableCases, allowOpenTransitionSchemas });
      continue;
    }
    if (descriptor.kind === 'parallel-items') {
      const itemTargetSets = [];
      for (const [index, item] of descriptor.items.entries()) {
        if (item.kind === 'static-target') {
          itemTargetSets.push([[item.target]]);
        } else if (item.kind === 'dynamic-target') {
          const aggregate = assertDynamicTargetSchema({ workflow, schemasByStep, stepId, step, expression: item.expression, field: fieldPath('next', index), requireSchemaCoverage, requireExpressionRequiredPaths, allowOpenTransitionSchemas });
          if (aggregate) itemTargetSets.push(targetSetsForDynamicTarget(aggregate));
        } else if (item.kind === 'match-cases') {
          const possibleCaseKeys = assertMatchCasesSchema({ workflow, schemasByStep, stepId, step, descriptor: item, field: fieldPath('next', index), requireSchemaCoverage, requireExpressionRequiredPaths, allowUnreachableCases, allowOpenTransitionSchemas });
          if (possibleCaseKeys) itemTargetSets.push(targetSetsForMatchCases(possibleCaseKeys, item.cases));
        }
      }
      assertParallelItemCombinations({ workflow, stepId, itemTargetSets });
    }
  }
}

function validateWorkflowDocument(workflow, options = {}) {
  assertWorkflowSchema(workflow);
  assertWorkflowIdentity(workflow);
  assertWorkflowStepIds(workflow);
  assertWorkflowRootTargets(workflow);
  assertWorkflowInputStateSelectors(workflow);
  assertWorkflowStepRoles(workflow, options.allowedRoles ?? []);
  const warnings = [];
  const schemasByStep = normalizeStepOutputSchemas({
    workflow,
    outputSchemas: options.outputSchemas,
    warnings,
    requireSchemaPresence: options.requireSchemaPresence ?? true,
    requireWorkerOutcomeContract: options.requireWorkerOutcomeContract ?? true,
  });
  assertTransitionSemantics(workflow, schemasByStep, {
    requireSchemaCoverage: options.requireSchemaCoverage ?? true,
    requireExpressionRequiredPaths: options.requireExpressionRequiredPaths ?? true,
    allowUnreachableCases: options.allowUnreachableCases ?? false,
    allowOpenTransitionSchemas: options.allowOpenTransitionSchemas ?? false,
  });
  const result = { ok: true, workflow: workflow.name, steps: Object.keys(workflow.steps).length };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}


export class Workflow {
  constructor(workflowData) {
    this.data = cloneBoundaryData(workflowData);
    this.steps = this.data.steps ?? {};
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }

  validate(options = {}) {
    return validateWorkflowDocument(this.toJSON(), options);
  }

  validateStaticTransitions() {
    for (const [stepId, step] of Object.entries(this.data.steps)) {
      if (!Object.hasOwn(step, 'next')) continue;
      assertTransitionDescriptorTargets(this.data, stepId, normalizeTransitionNext(step.next));
    }
    return { ok: true };
  }

  validateOutputSchemas(outputSchemas = new Map()) {
    const warnings = [];
    const schemasByStep = normalizeStepOutputSchemas({ workflow: this.data, outputSchemas, warnings });
    return { ok: true, schemasByStep, warnings };
  }

  getStep(stepId) {
    const step = this.steps[stepId];
    if (!step) throw new WorkflowRuntimeError(`workflow step not found: ${stepId}`);
    return new Step({ id: stepId, ...step });
  }

  hasStep(stepId) {
    return Object.hasOwn(this.steps, stepId);
  }

  getStartStep() {
    return this.getStep(this.data.start);
  }

  statusForStep(stepId) {
    return statusForStep(this.data, stepId, this.steps[stepId]);
  }

  inferStep(baton) {
    const batonData = typeof baton?.toJSON === 'function' ? baton.toJSON() : baton;
    const stepId = batonData?.cursor;
    if (!this.hasStep(stepId)) throw new WorkflowRuntimeError(`baton cursor not found in workflow: ${stepId}`);
    return this.getStep(stepId);
  }
}

export { validateWorkflowDocument };
