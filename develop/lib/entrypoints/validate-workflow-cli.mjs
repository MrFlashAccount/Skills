import { validateWorkflowDocument } from '../use-cases/index.mjs';
import { WorkflowFileAdapter } from '../persistence/index.mjs';

const workflowFiles = new WorkflowFileAdapter();

function fail(message) {
  console.error(`validate-workflow: ${message}`);
  process.exit(1);
}

export async function runCli(argv = process.argv.slice(2)) {
  const workflowPaths = [...argv];
  if (workflowPaths.length === 0) {
    workflowPaths.push('workflows/dev-harness/workflow.json', 'workflows/research-critic/workflow.json');
  }

  try {
    const results = workflowPaths.map((workflowPath) => validateWorkflowDocument({
      workflow: workflowFiles.readWorkflow(workflowPath),
      workflowPath,
      repositoryRoot: workflowFiles.repositoryRootForWorkflow(workflowPath),
    }));
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  } catch (error) {
    if (error?.name === 'WorkflowInterpreterError') fail(error.message);
    throw error;
  }
}
