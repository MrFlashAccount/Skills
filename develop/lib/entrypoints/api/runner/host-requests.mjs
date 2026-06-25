import { join } from "node:path";
import { loadOutputSchema } from "../../../persistence/workflow-resources/output-schema-loader.mjs";

const TERMINAL_ACTIONS = new Set(["stop_done", "stop_blocked"]);
const SAFE_STEP_ID = /^[A-Za-z0-9_.-]+$/;

export function assertSafeStepId(stepId) {
  if (
    typeof stepId !== "string" ||
    !SAFE_STEP_ID.test(stepId) ||
    stepId === "." ||
    stepId === ".."
  ) {
    throw new Error(`invalid workflow step id for runner storage: ${stepId}`);
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function instructionPathForStep(instructionsDir, stepId) {
  assertSafeStepId(stepId);
  return join(instructionsDir, `${stepId}.md`);
}

export function loadInstructionsCommandForStep(
  runId,
  stepId,
  { runsRoot, leaseToken } = {},
) {
  assertSafeStepId(stepId);
  const runsRootArg = runsRoot ? ` --runs-root ${shellQuote(runsRoot)}` : "";
  const token =
    typeof leaseToken === "string" && leaseToken.length > 0
      ? shellQuote(leaseToken)
      : "<lease-token>";
  return `node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --lease-token ${token}`;
}

export function continueCommandForRun(runId, { runsRoot, leaseToken } = {}) {
  const runsRootArg = runsRoot ? ` --runs-root ${shellQuote(runsRoot)}` : "";
  const token =
    typeof leaseToken === "string" && leaseToken.length > 0
      ? shellQuote(leaseToken)
      : "<lease-token>";
  return `node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id ${shellQuote(runId)}${runsRootArg} --lease-token ${token}`;
}

export function continueInstructionCommandForRun(runId, options = {}) {
  return `${continueCommandForRun(runId, options)} --only-instructions`;
}

export function writeOutputCommandForStep(
  runId,
  stepId,
  { runsRoot, leaseToken } = {},
) {
  assertSafeStepId(stepId);
  const runsRootArg = runsRoot ? ` --runs-root ${shellQuote(runsRoot)}` : "";
  const token =
    typeof leaseToken === "string" && leaseToken.length > 0
      ? shellQuote(leaseToken)
      : "<lease-token>";
  return [
    `node develop/lib/entrypoints/cli/workflow-runner.mjs write-output --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --lease-token ${token} --only-instructions <<'JSON'`,
    "<paste strict JSON here>",
    "JSON",
  ].join("\n");
}

export function responseStatusForInterpreterResponse(interpreterResponse) {
  const steps = interpreterResponse.steps ?? [];
  if (steps.length === 1 && steps[0].action === "stop_done") return "done";
  if (steps.length === 1 && steps[0].action === "stop_blocked")
    return "blocked";
  return "needs_host_actions";
}

const TERMINAL_ORCHESTRATOR_INSTRUCTIONS_BY_STATUS = Object.freeze({
  needs_host_actions: (ctx) => [
    "Execute every current host request and wait until all requested actions finish.",
    ...ctx.requests.flatMap((request, index) => [
      `${index + 1}. ${request.action} ${request.stepId}`,
      "Load instructions with:",
      request.loadInstructionsCommand,
    ]),
    "Then run:",
    ctx.continueCommand,
    "Follow that stdout instruction exactly.",
  ].join("\n"),
  done: () =>
    "Stop now. Do not call another runner command. Report the completed result from this stdout; status done is the terminal result.",
  blocked: () =>
    "Stop now. Do not call another runner command. Report the blocker from this stdout; status blocked is the terminal result.",
});

function orchestratorInstructionForStatus(status, ctx) {
  const instruction = TERMINAL_ORCHESTRATOR_INSTRUCTIONS_BY_STATUS[status];
  if (!instruction)
    throw new Error(`unknown workflow runner host response status: ${status}`);

  return instruction(ctx);
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
      continueCommand: continueInstructionCommandForRun(options.runId, {
        runsRoot: options.runsRoot,
        leaseToken: options.leaseToken,
      }),
    }),
    baton: interpreterResponse.baton,
  };
  if (status === "needs_host_actions")
    response.requests = requests;
  return response;
}
