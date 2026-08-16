import assert from "node:assert/strict";
import test from "node:test";

import question from "../dist/index.js";

function createTool() {
  let tool;
  question({
    registerTool(candidate) {
      tool = candidate;
    },
  });
  assert.ok(tool);
  return tool;
}

test("registers the question tool and returns a selected option", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    {
      question: "Where should this run?",
      options: [
        { label: "Local" },
        { label: "Production" },
      ],
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => "Production",
        input: async () => undefined,
      },
    },
  );

  assert.equal(result.content[0].text, "User selected: 2. Production");
  assert.equal(result.details.answer, "Production");
  assert.equal(result.details.wasCustom, false);
});

test("collects a free-form answer", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    {
      question: "Which environment?",
      options: [{ label: "Local" }],
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => "Type something.",
        input: async () => "BizaClaw_Remote",
      },
    },
  );

  assert.equal(result.content[0].text, "User wrote: BizaClaw_Remote");
  assert.equal(result.details.answer, "BizaClaw_Remote");
  assert.equal(result.details.wasCustom, true);
});

test("returns an explicit cancellation result", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    { question: "Choose", options: [{ label: "A" }] },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => undefined,
        input: async () => undefined,
      },
    },
  );

  assert.equal(result.content[0].text, "User cancelled the selection");
  assert.equal(result.details.answer, null);
});
