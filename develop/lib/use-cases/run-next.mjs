import { renderWorkflow } from './inspect-workflow.mjs';

/** Renders the next interpreter response from DTO inputs. Persistence/host response assembly is owned by entrypoints. */
export function next({ workflow, baton, renderSteps, runtime, includeDiagnostics = false, initialized, resumed }) {
  const rendered = renderWorkflow({ workflow, baton, renderSteps, runtime, includeDiagnostics });
  return {
    rendered,
    baton: rendered.baton,
    initialized,
    resumed,
  };
}
