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
  assert.equal(result.details.status, "answered");
  assert.equal(result.details.selectedIndex, 1);
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
  // `ctx.ui.select()` renders its title with one column of horizontal padding.
  const rendered = new Text(receivedTitle, 1, 0).render(40);
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
  assert.equal(result.details.status, "answered");
  assert.equal(result.details.selectedIndex, null);
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
  assert.equal(result.details.status, "cancelled");
});

test("propagates the abort signal to both dialogs", async () => {
  const tool = createTool();
  const controller = new AbortController();
  let selectOptions;
  let inputOptions;

  const result = await tool.execute(
    "test",
    { question: "Which environment?", options: [{ label: "Local" }] },
    controller.signal,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async (_title, _options, options) => {
          selectOptions = options;
          return "2. Type something.";
        },
        input: async (_title, _placeholder, options) => {
          inputOptions = options;
          return "Remote";
        },
      },
    },
  );

  assert.equal(selectOptions.signal, controller.signal);
  assert.equal(inputOptions.signal, controller.signal);
  assert.equal(result.details.answer, "Remote");
});

test("does not open a dialog for an already aborted execution", async () => {
  const tool = createTool();
  const controller = new AbortController();
  controller.abort();
  let opened = false;

  const result = await tool.execute(
    "test",
    { question: "Choose", options: [{ label: "A" }] },
    controller.signal,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => {
          opened = true;
          return "1. A";
        },
        input: async () => undefined,
      },
    },
  );

  assert.equal(opened, false);
  assert.equal(result.details.status, "cancelled");
});

test("preserves the selected index when option labels repeat", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    {
      question: "Which release?",
      options: [{ label: "Deploy" }, { label: "Deploy" }],
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => "2. Deploy",
        input: async () => undefined,
      },
    },
  );

  assert.equal(result.content[0].text, "User selected: 2. Deploy");
  assert.equal(result.details.selectedIndex, 1);
  const rendered = tool.renderResult(result, {}, { fg: (_color, text) => text }).render(80);
  assert.equal(rendered[0].trimEnd(), "✓ 2. Deploy");
});

test("renders execution errors instead of labelling them as cancellation", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    { question: "Choose", options: [{ label: "A" }] },
    undefined,
    undefined,
    { hasUI: false, ui: {} },
  );

  assert.equal(result.details.status, "error");
  const rendered = tool.renderResult(result, {}, { fg: (_color, text) => text }).render(80);
  assert.equal(rendered[0].trimEnd(), "Error: UI not available (running in non-interactive mode)");
});

test("handles an empty option list as an execution error", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    { question: "Choose", options: [] },
    undefined,
    undefined,
    { hasUI: true, ui: {} },
  );

  assert.equal(result.content[0].text, "Error: No options provided");
  assert.equal(result.details.status, "error");
});


test("renders malformed call options without throwing", () => {
  const tool = createTool();
  const rendered = tool.renderCall(
    { question: "Choose", options: [null, {}] },
    { fg: (_color, text) => text, bold: (text) => text },
  ).render(80);

  const renderedText = rendered.join(" ");
  assert.match(renderedText, /1\. \(invalid option\)/);
  assert.match(renderedText, /2\. \(invalid option\)/);
});
