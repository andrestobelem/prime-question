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
    "2.  Type something.",
  ]);
  assert.equal(receivedTitle, ` Question\n${questionText}`);
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
        select: async () => "2.  Type something.",
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

test("sanitizes terminal control sequences before displaying answers", async () => {
  const tool = createTool();
  const hostile = "\u001b[2J\u001b]52;c;SGVsbG8=\u0007Hello";
  let receivedTitle;
  let receivedOptions;

  const result = await tool.execute(
    "test",
    {
      question: hostile,
      options: [{ label: hostile, description: hostile }],
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async (title, options) => {
          receivedTitle = title;
          receivedOptions = options;
          return "1. Hello — Hello";
        },
        input: async () => undefined,
      },
    },
  );

  assert.equal(receivedTitle, " Question\nHello");
  assert.deepEqual(receivedOptions, ["1. Hello — Hello", "2.  Type something."]);
  assert.equal(result.content[0].text, "User selected: 1. Hello");
  assert.equal(result.details.answer, "Hello");

  const renderedCall = tool
    .renderCall(
      { question: hostile, options: [{ label: hostile }] },
      { fg: (_color, text) => text, bold: (text) => text },
    )
    .render(80)
    .join(" ");
  assert.doesNotMatch(renderedCall, /\u001b|52;c;/);

  const renderedResult = tool
    .renderResult(
      {
        content: [{ type: "text", text: "legacy" }],
        details: {
          options: [hostile],
          answer: hostile,
          wasCustom: false,
          selectedIndex: 0,
        },
      },
      {},
      { fg: (_color, text) => text },
    )
    .render(80);
  assert.equal(renderedResult[0].trimEnd(), " 1. Hello");
  assert.doesNotMatch(renderedResult[0], /\u001b|52;c;/);
});

test("sanitizes custom answers before returning and rendering them", async () => {
  const tool = createTool();
  const hostile = "\u001b[31mRemote\u001b[0m";
  const result = await tool.execute(
    "test",
    { question: "Where?", options: [{ label: "Local" }] },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => "2.  Type something.",
        input: async () => hostile,
      },
    },
  );

  assert.equal(result.content[0].text, "User wrote: Remote");
  assert.equal(result.details.answer, "Remote");
  const rendered = tool
    .renderResult(result, {}, { fg: (_color, text) => text })
    .render(80)
    .join(" ");
  assert.equal(rendered.trimEnd(), "  (wrote) Remote");
  assert.doesNotMatch(rendered, /\u001b/);
});

test("bounds oversized custom answers", async () => {
  const tool = createTool();
  const result = await tool.execute(
    "test",
    { question: "Where?", options: [{ label: "Local" }] },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => "2.  Type something.",
        input: async () => "x".repeat(4_001),
      },
    },
  );

  assert.equal(result.details.answer.length, 4_000);
  assert.equal(result.content[0].text.length, "User wrote: ".length + 4_000);
});

test("propagates dialog failures as tool errors", async () => {
  const tool = createTool();
  await assert.rejects(
    () =>
      tool.execute(
        "test",
        { question: "Choose", options: [{ label: "A" }] },
        undefined,
        undefined,
        {
          hasUI: true,
          ui: {
            select: async () => {
              throw new Error("selector failed");
            },
            input: async () => undefined,
          },
        },
      ),
    { message: "selector failed" },
  );

  await assert.rejects(
    () =>
      tool.execute(
        "test",
        { question: "Choose", options: [{ label: "A" }] },
        undefined,
        undefined,
        {
          hasUI: true,
          ui: {
            select: async () => "2.  Type something.",
            input: async () => {
              throw new Error("input failed");
            },
          },
        },
      ),
    { message: "input failed" },
  );
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
          return "2.  Type something.";
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

test("does not open custom input after selection aborts", async () => {
  const tool = createTool();
  const controller = new AbortController();
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
          controller.abort();
          return "2.  Type something.";
        },
        input: async () => {
          opened = true;
          return "Remote";
        },
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
  assert.equal(rendered[0].trimEnd(), " 2. Deploy");
});

test("reports unavailable UI as a real tool error", async () => {
  const tool = createTool();
  await assert.rejects(
    () =>
      tool.execute(
        "test",
        { question: "Choose", options: [{ label: "A" }] },
        undefined,
        undefined,
        { hasUI: false, ui: {} },
      ),
    { message: "UI not available (running in non-interactive mode)" },
  );

  // Prime Agent supplies an empty details object for thrown tool errors.
  const rendered = tool
    .renderResult(
      { content: [{ type: "text", text: "Error: UI unavailable" }], details: {} },
      {},
      { fg: (_color, text) => text },
      { isError: true },
    )
    .render(80);
  assert.equal(rendered[0].trimEnd(), " Error: UI unavailable");
});

test("handles an empty option list as an execution error", async () => {
  const tool = createTool();
  await assert.rejects(
    () =>
      tool.execute(
        "test",
        { question: "Choose", options: [] },
        undefined,
        undefined,
        { hasUI: true, ui: {} },
      ),
    { message: "No options provided" },
  );
  assert.equal(tool.parameters.properties.options.minItems, 1);
  assert.equal(tool.parameters.properties.options.maxItems, 32);
  assert.equal(tool.parameters.properties.question.maxLength, 4_000);
  assert.equal(tool.parameters.properties.options.items.properties.label.maxLength, 500);
  assert.equal(
    tool.parameters.properties.options.items.properties.description.maxLength,
    1_000,
  );
});

test("rejects calls with too many options", async () => {
  const tool = createTool();
  await assert.rejects(
    () =>
      tool.execute(
        "test",
        {
          question: "Choose",
          options: Array.from({ length: 33 }, (_, index) => ({ label: String(index) })),
        },
        undefined,
        undefined,
        { hasUI: true, ui: {} },
      ),
    { message: "Too many options (maximum 32)" },
  );
});

test("renders host errors and malformed details without throwing", () => {
  const tool = createTool();
  const theme = { fg: (_color, text) => text };

  const hostError = tool
    .renderResult(
      {
        content: [{ type: "text", text: "\u001b[31mboom\u001b[0m" }],
        details: {},
      },
      {},
      theme,
      { isError: true },
    )
    .render(80);
  assert.equal(hostError[0].trimEnd(), " boom");
  assert.doesNotMatch(hostError[0], /\u001b/);

  const fallback = tool
    .renderResult({ content: [{ type: "text", text: "boom" }], details: {} }, {}, theme)
    .render(80);
  assert.equal(fallback[0].trimEnd(), "boom");
});

test("does not render a custom option for an empty call", () => {
  const tool = createTool();
  const rendered = tool
    .renderCall(
      { question: "Choose", options: [] },
      { fg: (_color, text) => text, bold: (text) => text },
    )
    .render(80)
    .join(" ");

  assert.doesNotMatch(rendered, /Options:/);
  assert.doesNotMatch(rendered, /Type something\./);
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


test("uses theme colors for question calls and results", async () => {
  const tool = createTool();
  const theme = {
    fg: (color, text) => `<${color}>${text}</${color}>`,
    bold: (text) => `**${text}**`,
  };
  const callText = tool
    .renderCall({ question: "Where?", options: [{ label: "Local" }] }, theme)
    .render(200)
    .join(" ");

  assert.match(callText, /<toolTitle>\*\* question \*\*<\/toolTitle>/);
  assert.match(callText, /<text>Where\?<\/text>/);
  assert.match(callText, /<accent>1\. Local<\/accent>/);
  assert.match(callText, /<muted>Options: <\/muted>/);

  const result = await tool.execute(
    "test",
    { question: "Where?", options: [{ label: "Local" }] },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async () => "1. Local",
        input: async () => undefined,
      },
    },
  );
  const resultText = tool.renderResult(result, {}, theme).render(80)[0].trimEnd();
  assert.equal(resultText, "<success> </success><accent>1. Local</accent>");
});
