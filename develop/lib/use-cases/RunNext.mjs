/** RunNext use-case coordinates Workflow/Baton/Step/Template for next render. */
import { Workflow } from '../entities/Workflow.mjs';
import { Baton } from '../entities/Baton.mjs';
import { Template } from '../entities/Template.mjs';
import { responseFor } from './interpreter/output/response.mjs';

export function runNext({ workflowDTO, batonDTO, templateDTO, outputSchemas = new Map(), render = false } = {}) {
  const workflow = new Workflow(workflowDTO);
  const baton = new Baton(batonDTO);
  workflow.validate({ outputSchemas });
  baton.validateAgainst(workflow);
  const step = workflow.inferStep(baton);
  step.resolveInputs(baton.toJSON(), workflow);
  step.validateForRun({ workflow });
  const response = responseFor(baton.toJSON(), baton.currentCursor(), step.toJSON(), workflow.toJSON());
  if (!render) return response;
  const context = step.prepareRenderContext({ workflow, baton: baton.toJSON() });
  return { ...response, steps: response.steps.map((entry) => ({ ...entry, compiledPrompt: new Template(templateDTO).render({ ...context, stepId: entry.id, step: entry.step }) })) };
}

export const RunNext = { execute: runNext };
