import test from "node:test";
import assert from "node:assert/strict";

import {
  renderHostDirectiveForStep,
  renderStepInstructionsForStep,
} from "./pipeline.mjs";

test("worker renderer keeps worker prompt out of host directives", () => {
  const step = {
    id: "implement",
    action: "run_worker",
    compiledPrompt: {
      prompt: "Do worker task.\n\nWrite output with the validating command.",
    },
  };

  assert.equal(renderHostDirectiveForStep(step), "");
});

test("worker renderer returns compiled prompt for step instructions", () => {
  const step = {
    id: "implement",
    action: "run_worker",
    compiledPrompt: {
      prompt: "Do worker task.\n\nWrite output with the validating command.",
    },
  };

  assert.equal(
    renderStepInstructionsForStep(step),
    "Do worker task.\n\nWrite output with the validating command.",
  );
});

test("worker renderer rejects missing compiled prompt for step instructions", () => {
  const step = {
    id: "implement",
    action: "run_worker",
    compiledPrompt: {},
  };

  assert.throws(
    () => renderStepInstructionsForStep(step),
    /missing compiled instructions for workflow step 'implement'/,
  );
});
