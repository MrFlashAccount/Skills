import { applyOutputToBatonState } from '../../../runtime/baton-state.mjs';
import { renderWorkflowPrompt } from '../../../entities/Template/index.mjs';
import { invariant } from '../../../errors.mjs';
import { responseFor } from '../output/response.mjs';
import { assertStartupUserPromptTargetRenderable, markUserPromptInjectedForStep, selectedUserPromptStepId, validateSelectedStartupUserPromptTarget } from '../../user-prompt.mjs';

export function renderStepPrompts({ workflow, baton, steps, resources, includeDiagnostics = false } = {}) {
  assertStartupUserPromptTargetRenderable({ workflow, baton, steps });
  const userPromptStepId = selectedUserPromptStepId({ workflow, baton });
  const rendered = steps.map((entry) => {
    const stepResources = {
      ...resources,
      validatingWriterCommand: resources?.validatingWriterCommandForStep?.(entry.id) ?? resources?.validatingWriterCommand,
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
      }),
    };
  });
  return rendered;
}

export function prepareParallelBranch({ workflow, baton, stepId, step, output, attempts, targets = step.next, storeStepOutput = false }) {
  invariant(Array.isArray(targets), `workflow step '${stepId}' cannot prepare parallel branch steps without array next`);
  let updatedBaton = structuredClone(baton);
  const outputStepId = step.kind === 'worker' || storeStepOutput ? stepId : undefined;
  updatedBaton = markUserPromptInjectedForStep({
    workflow,
    baton: updatedBaton,
    stepId,
  });
  updatedBaton = validateSelectedStartupUserPromptTarget({
    workflow,
    baton: updatedBaton,
    steps: targets.map((targetId) => ({ id: targetId, step: workflow.steps[targetId] })),
  });
  updatedBaton.state = applyOutputToBatonState(updatedBaton, output, attempts, outputStepId, {
    mirrorToOutputs: Boolean(step.output?.schema),
  });
  updatedBaton.status = 'running';
  delete updatedBaton.blocker;
  return responseFor(updatedBaton, stepId, { ...step, next: targets }, workflow, { parallelTargets: true });
}
