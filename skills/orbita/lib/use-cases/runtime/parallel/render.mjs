import { renderWorkflowPrompt } from '../../../entities/Template/index.mjs';
import { assertStartupUserPromptTargetRenderable, selectedUserPromptStepId } from '../../user-prompt.mjs';

export function renderStepPrompts({ workflow, baton, steps, resources, includeDiagnostics = false, followUp = false } = {}) {
  assertStartupUserPromptTargetRenderable({ workflow, baton, steps });
  const userPromptStepId = selectedUserPromptStepId({ workflow, baton });
  const rendered = steps.map((entry) => {
    const stepResources = {
      ...resources,
      validatingWriterCommand: resources?.validatingWriterCommandForStep?.(entry.id) ?? resources?.validatingWriterCommand,
      artifactOutputDir: resources?.artifactOutputDirForStep?.(entry.id) ?? resources?.artifactOutputDir,
    };
    return {
      ...entry,
      compiledPrompt: renderWorkflowPrompt({
        workflow,
        baton,
        stepId: entry.id,
        step: entry.step,
        resources: stepResources,
        includeDiagnostics,
        userPrompt: userPromptStepId === entry.id ? baton.user_prompt : undefined,
        followUp,
      }),
    };
  });
  return rendered;
}
