#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { applyWorkflowOutput } from '../../use-cases/ApplyWorkflowOutput.mjs';
import { inspectWorkflow } from '../../use-cases/InspectWorkflow.mjs';
import { runNext } from '../../use-cases/RunNext.mjs';
import { loadWorkflowRuntime, readWorkerOutputText } from '../../persistence/workflow-resources/runtime-reader.mjs';

function fail(message) {
  console.error(`workflow-runtime-harness: ${message}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { diagnostics: { type: 'boolean', default: false } },
    });
    return { args: parsed.positionals, includeDiagnostics: parsed.values.diagnostics };
  } catch (error) {
    fail(error.message);
  }
}

function assertArgs(args) {
  const [mode, workflowPath, batonPath, outputPath] = args;
  if (!['inspect', 'render', 'apply'].includes(mode)) fail('usage: workflow-runtime-harness inspect|render|apply');
  if (!workflowPath || !batonPath) fail(`usage: workflow-runtime-harness ${mode} <workflow.json> <baton.json>${mode === 'apply' ? ' <worker-output.json>' : ''}`);
  if (mode === 'apply' && !outputPath) fail('usage: workflow-runtime-harness apply <workflow.json> <baton.json> <worker-output.json>');
  if (mode !== 'apply' && outputPath) fail(`usage: workflow-runtime-harness ${mode} <workflow.json> <baton.json>`);
}

function run({ mode, workflowPath, batonPath, outputPath, includeDiagnostics }) {
  const runtime = loadWorkflowRuntime({ workflowPath, batonPath });
  if (mode === 'inspect') {
    return inspectWorkflow({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, resources: runtime.resources });
  }
  if (mode === 'render') {
    return runNext({ workflowDoc: runtime.workflow, batonDoc: runtime.baton, resources: runtime.resources, includeDiagnostics });
  }
  return applyWorkflowOutput({
    workflowDoc: runtime.workflow,
    batonDoc: runtime.baton,
    outputContent: readWorkerOutputText({ outputPath }),
    resources: runtime.resources,
  });
}

try {
  const { args, includeDiagnostics } = parseCliArgs(process.argv.slice(2));
  assertArgs(args);
  const [mode, workflowPath, batonPath, outputPath] = args;
  console.log(JSON.stringify(run({ mode, workflowPath, batonPath, outputPath, includeDiagnostics }), null, 2));
} catch (error) {
  if (error instanceof WorkflowRuntimeError) fail(error.message);
  throw error;
}
