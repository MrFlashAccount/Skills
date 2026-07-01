import { fileURLToPath } from "node:url";

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

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export const WORKFLOW_RUNNER_CLI_PATH = fileURLToPath(
  new URL("../../cli/workflow-runner.mjs", import.meta.url),
);

export const WORKFLOW_RUNNER_COMMAND = `node ${shellQuote(WORKFLOW_RUNNER_CLI_PATH)}`;

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

export function recordOrchestratorCommandForRun(runId, { runsRoot, leaseToken } = {}) {
  const runsRootArg = runsRoot ? ` --runs-root ${shellQuote(runsRoot)}` : "";
  const token =
    typeof leaseToken === "string" && leaseToken.length > 0
      ? shellQuote(leaseToken)
      : "<lease-token>";
  return [
    `${WORKFLOW_RUNNER_COMMAND} record-orchestrator --run-id ${shellQuote(runId)}${runsRootArg} --lease-token ${token} <<'JSON'`,
    "<paste orchestrator debug JSON here>",
    "JSON",
  ].join("\n");
}

export function writeOutputCommandForStep(
  runId,
  stepId,
  { runsRoot, leaseToken, debugSummaryFile } = {},
) {
  assertSafeStepId(stepId);
  const runsRootArg = runsRoot ? ` --runs-root ${shellQuote(runsRoot)}` : "";
  const token =
    typeof leaseToken === "string" && leaseToken.length > 0
      ? shellQuote(leaseToken)
      : "<lease-token>";
  const debugSummaryArg = typeof debugSummaryFile === "string" && debugSummaryFile.length > 0
    ? ` --debug-summary-file ${shellQuote(debugSummaryFile)}`
    : "";
  return [
    `${WORKFLOW_RUNNER_COMMAND} write-output --run-id ${shellQuote(runId)} --step-id ${shellQuote(stepId)}${runsRootArg} --lease-token ${token}${debugSummaryArg} <<'JSON'`,
    "<paste strict JSON here>",
    "JSON",
  ].join("\n");
}
