import { invariant } from './errors.mjs';

const LEGACY_STEP_KINDS = new Set(['subagent', 'user_approval', 'terminal']);
const LEGACY_STEP_FIELDS = new Set(['outcomes', 'takesArtifacts', 'producesArtifacts', 'template']);

export function rejectLegacyWorkflowVocabulary(workflowDoc) {
  const workflow = workflowDoc?.workflow;
  if (!workflow || typeof workflow !== 'object') return;

  const legacyFields = [];
  const legacyKinds = [];
  for (const [stepId, step] of Object.entries(workflow.steps ?? {})) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    if (LEGACY_STEP_KINDS.has(step.kind)) legacyKinds.push(`${stepId}.kind=${step.kind}`);
    for (const field of Object.keys(step)) {
      if (LEGACY_STEP_FIELDS.has(field)) legacyFields.push(`${stepId}.${field}`);
    }
  }

  invariant(
    legacyKinds.length === 0 && legacyFields.length === 0,
    `unsupported legacy workflow vocabulary: ${[...legacyKinds, ...legacyFields].join(', ')}`,
  );
}
