import assert from "node:assert/strict";
import test from "node:test";

import question from "../dist/index.js";
import { Text } from "@earendil-works/pi-tui";

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
        select: async () => "2. Production",
        input: async () => undefined,
      },
    },
  );

  assert.equal(result.content[0].text, "User selected: 2. Production");
  assert.equal(result.details.answer, "Production");
  assert.equal(result.details.wasCustom, false);
});

test("keeps long question content available to the daemon selector", async () => {
  const tool = createTool();
  const questionText =
    "Which deployment target should receive this change after all validation steps complete?";
  const optionText =
    "Production environment with the carefully controlled release process";
  const descriptionText =
    "Deploy only after the long-running checks and approval workflow finish";
  let receivedTitle;
  let receivedOptions;

  const result = await tool.execute(
    "test",
    {
      question: questionText,
      options: [{ label: optionText, description: descriptionText }],
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async (title, options) => {
          receivedTitle = title;
          receivedOptions = options;
          return `1. ${optionText} — ${descriptionText}`;
        },
        input: async () => undefined,
      },
    },
  );

  assert.deepEqual(receivedOptions, [
    `1. ${optionText} — ${descriptionText}`,
    "2. Type something.",
  ]);
  assert.equal(receivedTitle, `Question\n${questionText}`);
  assert.ok(!receivedTitle.includes(optionText));
  assert.ok(!receivedTitle.includes(descriptionText));
  const rendered = new Text(receivedTitle, 0, 0).render(40);
  assert.ok(rendered.every((line) => line.length <= 40));
  const renderedText = rendered.join(" ").replace(/\s+/g, " ");
  assert.ok(renderedText.includes(questionText));
  assert.equal(result.details.answer, optionText);
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
        select: async () => "2. Type something.",
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
