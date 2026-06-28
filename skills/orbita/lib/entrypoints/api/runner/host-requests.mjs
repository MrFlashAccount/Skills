import { loadOutputSchema } from "../../../persistence/workflow-resources/output-schema-loader.mjs";
import {
  assertSafeStepId,
  bindAgentCommandForStep,
  continueInstructionCommandForRun,
  loadFollowupInstructionsCommandForStep,
  loadInstructionsCommandForStep,
} from "./runner-command-builder.mjs";
import { renderHostDirectiveForStep } from "./host-instructions/pipeline.mjs";

const TERMINAL_ACTIONS = new Set(["stop_done", "stop_blocked"]);
const SUPERSEDES_STDOUT_INSTRUCTION =
  "Supersedes all previous workflow-runner stdout.";

export { assertSafeStepId };

export function responseStatusForInterpreterResponse(interpreterResponse) {
  const steps = interpreterResponse.steps ?? [];
  if (steps.length === 1 && steps[0].action === "stop_done") return "done";
  if (steps.length === 1 && steps[0].action === "stop_blocked")
    return "blocked";
  return "needs_host_actions";
}

const TERMINAL_ORCHESTRATOR_INSTRUCTIONS_BY_STATUS = Object.freeze({
  needs_host_actions: (ctx) => [
    `Execute every host request in this JSON and wait until all requested actions finish: ${JSON.stringify(ctx.requests)}`,
    ctx.inlineInstructions,
    "Then run:",
    ctx.continueCommand,
    "Follow that stdout instruction exactly.",
  ].filter(Boolean).join("\n"),
  done: (ctx) =>
    `Stop now. Do not call another runner command. Terminal response JSON: ${JSON.stringify({ status: "done", baton: ctx.baton })}\nReport the completed result from that JSON; status done is the terminal result.`,
  blocked: (ctx) =>
    `Stop now. Do not call another runner command. Terminal response JSON: ${JSON.stringify({ status: "blocked", baton: ctx.baton })}\nReport the blocker from that JSON; status blocked is the terminal result.`,
});

function orchestratorInstructionForStatus(status, ctx) {
  const instruction = TERMINAL_ORCHESTRATOR_INSTRUCTIONS_BY_STATUS[status];
  if (!instruction)
    throw new Error(`unknown workflow runner host response status: ${status}`);

  return [SUPERSEDES_STDOUT_INSTRUCTION, instruction(ctx)].join("\n");
}

function inlineInstructionsForSteps(steps = [], options = {}) {
  const requestsByStepId = new Map(
    (options.requests ?? []).map((request) => [request.stepId ?? request.id, request]),
  );
  return steps
    .map((step) => renderHostDirectiveForStep(step, {
      ...options,
      request: requestsByStepId.get(step.id),
    }))
    .filter(Boolean)
    .join("\n\n");
}

function resolvedOutputSchemaForStep(
  step,
  { workflow, workflowPath, repositoryRoot = process.cwd() },
) {
  const schemaRef = step.step?.output?.schema;
  if (step.action !== "wait_for_approval" || !schemaRef) return undefined;
  const resolved = loadOutputSchema({
    workflow,
    workflowPath,
    schemaRef,
    repositoryRoot,
  });
  return {
    ref: schemaRef,
    schema: resolved.schema,
  };
}

function preferredAgentIdForStep(baton, stepId) {
  const bindings = baton?.workerBindings;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    return null;
  }
  const preferredAgentId = bindings[stepId];
  return typeof preferredAgentId === "string" && preferredAgentId.length > 0
    ? preferredAgentId
    : null;
}

export function buildHostRequests(
  interpreterResponse,
  { runId, workflow, workflowPath, repositoryRoot, runsRoot, leaseToken },
) {
  const status = responseStatusForInterpreterResponse(interpreterResponse);
  if (status !== "needs_host_actions") return [];

  return interpreterResponse.steps
    .filter((step) => !TERMINAL_ACTIONS.has(step.action))
    .map((step) => {
      const request = {
        id: step.id,
        stepId: step.id,
        action: step.action,
        loadInstructionsCommand: loadInstructionsCommandForStep(
          runId,
          step.id,
          { runsRoot, leaseToken },
        ),
      };
      if (step.action === "run_worker") {
        request.preferredAgentId = preferredAgentIdForStep(
          interpreterResponse.baton,
          step.id,
        );
        request.loadFollowupInstructionsCommand =
          loadFollowupInstructionsCommandForStep(runId, step.id, {
            runsRoot,
            leaseToken,
          });
        request.bindAgentCommand = bindAgentCommandForStep(runId, step.id, {
          runsRoot,
          leaseToken,
        });
      }
      const resolvedOutputSchema = resolvedOutputSchemaForStep(step, {
        workflow,
        workflowPath,
        repositoryRoot,
      });
      if (resolvedOutputSchema) {
        request.outputSchema = resolvedOutputSchema.ref;
        request.resolvedOutputSchema = resolvedOutputSchema;
      }
      return request;
    });
}

export function toHostResponse(interpreterResponse, options) {
  const status = responseStatusForInterpreterResponse(interpreterResponse);
  const requests =
    status === "needs_host_actions"
      ? buildHostRequests(interpreterResponse, options)
      : [];
  const response = {
    status,
    orchestratorInstruction: orchestratorInstructionForStatus(status, {
      requests,
      inlineInstructions: options.includeInlineInstructions
        ? inlineInstructionsForSteps(interpreterResponse.steps, {
            requests,
            runId: options.runId,
            runsRoot: options.runsRoot,
            leaseToken: options.leaseToken,
          })
        : "",
      continueCommand: continueInstructionCommandForRun(options.runId, {
        runsRoot: options.runsRoot,
        leaseToken: options.leaseToken,
      }),
      baton: interpreterResponse.baton,
    }),
    baton: interpreterResponse.baton,
  };
  if (status === "needs_host_actions")
    response.requests = requests;
  return response;
}
