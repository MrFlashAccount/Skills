/** ContinueRun use-case coordinates output application through Step/Baton/Workflow entities. */
import { Workflow } from '../entities/Workflow.mjs';
import { Baton } from '../entities/Baton.mjs';

export function continueRun({ workflowDTO, batonDTO, output } = {}) {
  const workflow = new Workflow(workflowDTO);
  const baton = new Baton(batonDTO);
  baton.validateAgainst(workflow);
  const step = workflow.inferStep(baton);
  return step.applyOutput({ baton: baton.toJSON(), output, workflow });
}

export const ContinueRun = { execute: continueRun };
