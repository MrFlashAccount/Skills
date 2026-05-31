import { readJson } from '../workflow/json-io.mjs';
import { defaultRepositoryRootForWorkflow } from '../workflow/resource-resolver.mjs';
import { renderStepPrompts } from '../workflow/interpreter/parallel/render.mjs';
import { applyParallelOutputs } from '../workflow/interpreter/parallel/apply.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from '../workflow/interpreter/output/worker-output.mjs';
import { assertResponseSchema } from '../workflow/schema-validation.mjs';

/** Task-shaped filesystem adapter for workflow documents and workflow resource/template boundaries. */
export class WorkflowFileAdapter {
  readWorkflow(path, name = 'workflow') {
    return readJson(path, name);
  }

  repositoryRootForWorkflow(path) {
    return defaultRepositoryRootForWorkflow(path);
  }

  renderStepsForResponse({ workflowPath, workflow, response, repositoryRoot, templateBaseDir }) {
    return ({ includeDiagnostics = false } = {}) => {
      const rendered = renderStepPrompts({
        workflowPath,
        workflow,
        baton: response.baton,
        steps: response.steps,
        repositoryRoot,
        templateBaseDir,
        includeDiagnostics,
      });
      assertResponseSchema({ ...response, steps: rendered });
      return rendered;
    };
  }

  isParallelOutputEnvelope(value) {
    return isParallelOutputEnvelope(value);
  }

  readStepOutput({ sourceLabel, baton, stepId, step, outputValue, outputParseError }) {
    return readWorkerOutputForStep({
      outputPath: sourceLabel,
      baton,
      stepId,
      step,
      allOutput: outputValue,
      outputParseError,
    });
  }

  validateStepOutput({ workflowPath, workflow, baton, stepId, step, workerOutput, repositoryRoot }) {
    return assertOutputSchemaIfDeclared({ workflowPath, workflow, baton, stepId, step, workerOutput, repositoryRoot });
  }

  applyParallelBranchOutput({ workflowPath, workflow, baton, step, outputPath, outputValue, targets, repositoryRoot }) {
    return applyParallelOutputs({
      workflowPath,
      workflow,
      baton,
      cursorStep: step,
      outputPath,
      allOutput: outputValue,
      targets,
      repositoryRoot,
    });
  }

}
