import { loadOutputSchema } from "../../../persistence/workflow-resources/output-schema-loader.mjs";
import {
  assertSafeStepId,
  bindAgentCommandForStep,
  continueInstructionCommandForRun,
  loadFollowupInstructionsCommandForStep,
  loadInstructionsCommandForStep,
  writeOutputCommandForStep,
} from "./runner-command-builder.mjs";

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
  const continueCommand = typeof runId === "string" && runId.length > 0
    ? continueInstructionCommandForRun(runId, {
        runsRoot,
        leaseToken,
      })
    : "";
  return [
    approvalRequestMessageForStep(step, {
      prompt,
      writeOutputCommand,
      continueCommand,
    }),
    "",
    "The orchestrator must execute this approval instruction itself.",
    "Show the approval request above to the user and ask only for the requested decision/input.",
    "Show/send every listed required artifact or file to the user before asking for approval.",
    "Do not replace artifact attachments with summaries or inline full artifact bodies. If the host cannot attach or link a listed artifact, state that capability gap explicitly in the approval message and include the path/reference that could not be attached.",
    "Do not show the raw compiled approval context to the user by default. Use request.loadInstructionsCommand only for diagnostics or when a listed artifact/reference is unclear.",
    "Do not inspect workflow source, runner internals, schema files, or CLI help to reconstruct approval output.",
    writeOutputCommand
      ? [
          "After the user decides, normalize the answer to strict JSON and submit it with this validating command:",
          "",
          writeOutputCommand,
        ].join("\n")
      : "If no validating write-output command is present, stop as blocked with a runner contract bug.",
  ].join("\n");
}

function sectionBody(prompt, heading) {
  const start = prompt.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const bodyStart = prompt.indexOf("\n", start);
  if (bodyStart < 0) return "";
  const nextHeading = prompt.indexOf("\n## ", bodyStart + 1);
  return prompt
    .slice(bodyStart + 1, nextHeading < 0 ? undefined : nextHeading)
    .trim();
}

function compactLines(value, { maxLines = 12 } = {}) {
  const lines = String(value)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, maxLines),
    `... ${lines.length - maxLines} more lines omitted; use request.loadInstructionsCommand only if the omitted lines are needed.`,
  ];
}

function approvalCaseValues(step) {
  const next = step.step?.next;
  if (!next || typeof next !== "object" || Array.isArray(next)) return [];
  if (next.match !== "${{ output.approval }}") return [];
  const cases = next.cases;
  if (!cases || typeof cases !== "object" || Array.isArray(cases)) return [];
  return Object.keys(cases);
}

function approvalAnswerContractLines(step) {
  const schemaRef = step.step?.output?.schema;
  if (typeof schemaRef === "string" && schemaRef.trim().length > 0) {
    return [
      `Schema-backed answer: normalize the user's decision to the declared output schema \`${schemaRef}\`.`,
      "Use the resolved request schema when present; do not infer a different shape.",
    ];
  }

  const values = approvalCaseValues(step);
  const examples = [];
  if (values.length === 0 || values.includes("approved")) {
    examples.push('{ "approval": "approved" }');
  }
  const changeValue = [
    "rejected",
    "request_changes",
    "changes_requested",
    "retry",
    "blocked",
  ].find((value) => values.includes(value));
  if (changeValue) examples.push(`{ "approval": "${changeValue}" }`);

  return [
    "Schema-less answer: submit one minimal normalized JSON object.",
    ...examples.map((example) => `Example: ${example}`),
  ];
}

function approvalRequestMessageForStep(step, { prompt, writeOutputCommand, continueCommand }) {
  const workflowStepPrompt = sectionBody(prompt, "Workflow step prompt");
  const requiredReads = sectionBody(prompt, "Required reads");
  const lines = [
    `Approval request: ${step.id}`,
    `Step: ${step.step?.name ?? step.id} (${step.id})`,
    "",
    "Show this approval request to the user.",
    "",
    "Ask the user:",
    ...(workflowStepPrompt
      ? compactLines(workflowStepPrompt, { maxLines: 6 })
      : ["Ask for the approval decision requested by this workflow step."]),
    "",
    "Show/send these required artifacts or files to the user before asking for approval:",
    ...(requiredReads
      ? compactLines(requiredReads)
      : ["No required artifacts or files are listed for this approval request."]),
    "If any listed artifact/file cannot be attached or linked, say that explicitly and include its path/reference.",
    "",
    "Accepted answer JSON:",
    ...approvalAnswerContractLines(step),
    "",
    "Validating writer command:",
    ...(writeOutputCommand
      ? writeOutputCommand.split("\n")
      : ["Missing validating writer command; stop as blocked with a runner contract bug."]),
    "",
    "Continuation command after all current request outputs are accepted:",
    continueCommand || "Missing continuation command; stop as blocked with a runner contract bug.",
  ];
  return lines.join("\n");
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
