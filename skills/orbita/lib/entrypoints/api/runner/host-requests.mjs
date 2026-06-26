import { loadOutputSchema } from "../../../persistence/workflow-resources/output-schema-loader.mjs";

const TERMINAL_ACTIONS = new Set(["stop_done", "stop_blocked"]);
const SAFE_STEP_ID = /^[A-Za-z0-9_.-]+$/;
const WORKFLOW_RUNNER_COMMAND = "node ./lib/entrypoints/cli/workflow-runner.mjs";
const SUPERSEDES_STDOUT_INSTRUCTION =
  "Supersedes all previous workflow-runner stdout.";

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
  return `${WORKFLOW_RUNNER_COMMAND} instructions --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --lease-token ${token}`;
}

export function loadFollowupInstructionsCommandForStep(
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
  return `${WORKFLOW_RUNNER_COMMAND} instructions --follow-up --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --lease-token ${token}`;
}

export function bindAgentCommandForStep(
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
  return `${WORKFLOW_RUNNER_COMMAND} bind-agent --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --agent-id <agent-id> --lease-token ${token}`;
}

export function continueCommandForRun(runId, { runsRoot, leaseToken } = {}) {
  const runsRootArg = runsRoot ? ` --runs-root ${shellQuote(runsRoot)}` : "";
  const token =
    typeof leaseToken === "string" && leaseToken.length > 0
      ? shellQuote(leaseToken)
      : "<lease-token>";
  return `${WORKFLOW_RUNNER_COMMAND} continue --run-id ${shellQuote(runId)}${runsRootArg} --lease-token ${token}`;
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
    `${WORKFLOW_RUNNER_COMMAND} write-output --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --lease-token ${token} <<'JSON'`,
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

function inlineInstructionForStep(step, { runId, runsRoot, leaseToken } = {}) {
  if (step.action !== "wait_for_approval") return "";
  const prompt = step.compiledPrompt?.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error(`missing compiled approval instructions for workflow step '${step.id}'`);
  }
  const writeOutputCommand = typeof runId === "string" && runId.length > 0
    ? writeOutputCommandForStep(runId, step.id, {
        runsRoot,
        leaseToken,
      })
    : "";
  return [
    `Approval request: ${step.id}`,
    "",
    "The orchestrator must execute this approval instruction itself.",
    "Use the following compiled approval prompt as the complete source for the user-facing approval message.",
    "Do not inspect workflow source, runner internals, schema files, or CLI help to reconstruct approval output.",
    writeOutputCommand
      ? [
          "After the user decides, normalize the answer to strict JSON and submit it with this validating command:",
          "",
          writeOutputCommand,
        ].join("\n")
      : "If no validating write-output command is present, stop as blocked with a runner contract bug.",
    "",
    prompt.trimEnd(),
  ].join("\n");
}

function inlineInstructionsForSteps(steps = [], options = {}) {
  return steps
    .map((step) => inlineInstructionForStep(step, options))
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
