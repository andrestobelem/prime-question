import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

interface OptionWithDescription {
  label: string;
  description?: string;
}

interface QuestionDetails {
  question: string;
  options: string[];
  answer: string | null;
  wasCustom: boolean;
  status: "answered" | "cancelled" | "error";
  selectedIndex: number | null;
}

const CUSTOM_ICON = "";
const CUSTOM_OPTION = `${CUSTOM_ICON} Type something.`;
const QUESTION_ICON = "";
const SUCCESS_ICON = "";
const CANCEL_ICON = "";
const ERROR_ICON = "";
const POWERLINE_SEPARATOR = "";

const OptionSchema = Type.Object({
  label: Type.String({ description: "Display label for the option" }),
  description: Type.Optional(
    Type.String({ description: "Optional helper text shown with the option" }),
  ),
});

const QuestionParams = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Array(OptionSchema, {
    description: "Options for the user to choose from",
  }),
});

function cancelledResult(question: string, options: string[]): {
  content: [{ type: "text"; text: string }];
  details: QuestionDetails;
} {
  return {
    content: [{ type: "text", text: "User cancelled the selection" }],
    details: {
      question,
      options,
      answer: null,
      wasCustom: false,
      status: "cancelled",
      selectedIndex: null,
    },
  };
}

function errorResult(
  question: string,
  options: string[],
  text: string,
): {
  content: [{ type: "text"; text: string }];
  details: QuestionDetails;
} {
  return {
    content: [{ type: "text", text }],
    details: {
      question,
      options,
      answer: null,
      wasCustom: false,
      status: "error",
      selectedIndex: null,
    },
  };
}

export default function question(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "question",
    label: "Question",
    description:
      "Ask the user a question and let them pick from options. Use when user input materially affects the next step.",
    promptSnippet: "Ask the user a clarifying question through the terminal UI when a decision affects the next step",
    promptGuidelines: [
      "Use question when user preferences materially affect the plan, scope, platform, or implementation path.",
      "Prefer 2-4 concrete options instead of guessing when a choice matters.",
      "Include enough context in the question and option labels for the user to decide quickly.",
    ],
    executionMode: "sequential",
    parameters: QuestionParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const options = params.options.map((option) => option.label);
      if (!ctx.hasUI) {
        return errorResult(
          params.question,
          options,
          "Error: UI not available (running in non-interactive mode)",
        );
      }

      if (params.options.length === 0) {
        return errorResult(params.question, [], "Error: No options provided");
      }

      if (signal?.aborted) {
        return cancelledResult(params.question, options);
      }

      // Keep each selector value unique while showing the answer and its description.
      // The selector truncates long rows to its available width.
      const selectionOptions = params.options.map((option, index) => {
        const description = option.description ? ` — ${option.description}` : "";
        return `${index + 1}. ${option.label}${description}`;
      });
      const customOptionIndex = params.options.length + 1;
      selectionOptions.push(`${customOptionIndex}. ${CUSTOM_OPTION}`);
      const selectionPrompt = [`${QUESTION_ICON} Question`, params.question].join("\n");
      const selected = await ctx.ui.select(selectionPrompt, selectionOptions, { signal });

      if (signal?.aborted || !selected) {
        return cancelledResult(params.question, options);
      }

      const selectedIndex = selectionOptions.indexOf(selected);
      if (selectedIndex < 0) {
        return cancelledResult(params.question, options);
      }

      if (selectedIndex === params.options.length) {
        const customAnswer = await ctx.ui.input(
          `${QUESTION_ICON} ${params.question}`,
          "Type your answer",
          { signal },
        );
        if (signal?.aborted) {
          return cancelledResult(params.question, options);
        }
        const answer = customAnswer?.trim();
        if (!answer) {
          return cancelledResult(params.question, options);
        }

        return {
          content: [{ type: "text" as const, text: `User wrote: ${answer}` }],
          details: {
            question: params.question,
            options,
            answer,
            wasCustom: true,
            status: "answered",
            selectedIndex: null,
          } satisfies QuestionDetails,
        };
      }

      const selectedOption = params.options[selectedIndex];
      if (!selectedOption) {
        return cancelledResult(params.question, options);
      }
      const answer = selectedOption.label;

      return {
        content: [
          {
            type: "text" as const,
            text: `User selected: ${selectedIndex + 1}. ${answer}`,
          },
        ],
        details: {
          question: params.question,
          options,
          answer,
          wasCustom: false,
          status: "answered",
          selectedIndex,
        } satisfies QuestionDetails,
      };
    },

    renderCall(args, theme) {
      const options: unknown[] = Array.isArray(args.options) ? args.options : [];
      const labels = options.map((option) => {
        if (!option || typeof option !== "object") return "(invalid option)";
        const label = (option as OptionWithDescription).label;
        return typeof label === "string" ? label : "(invalid option)";
      });
      const numbered = [...labels, CUSTOM_OPTION].map(
        (option, index) => `${index + 1}. ${option}`,
      );
      const questionText = typeof args.question === "string" ? args.question : "";
      let text =
        theme.fg("toolTitle", theme.bold(`${QUESTION_ICON} question `)) +
        theme.fg("text", questionText);
      if (numbered.length > 0) {
        const renderedOptions = numbered
          .map((option, index) =>
            theme.fg(index === numbered.length - 1 ? "muted" : "accent", option),
          )
          .join(theme.fg("dim", ", "));
        text +=
          `\n${theme.fg("dim", `  ${POWERLINE_SEPARATOR} `)}` +
          theme.fg("muted", "Options: ") +
          renderedOptions;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as QuestionDetails | undefined;
      const resultText = result.content.find((item) => item.type === "text")?.text ?? "";
      if (!details) {
        return new Text(resultText, 0, 0);
      }

      if (details.status === "error") {
        return new Text(
          theme.fg("error", `${ERROR_ICON} `) + theme.fg("muted", resultText),
          0,
          0,
        );
      }

      if (details.answer === null) {
        return new Text(
          theme.fg("warning", `${CANCEL_ICON} `) + theme.fg("muted", "Cancelled"),
          0,
          0,
        );
      }

      if (details.wasCustom) {
        return new Text(
          theme.fg("success", `${SUCCESS_ICON} `) +
            theme.fg("accent", `${CUSTOM_ICON} `) +
            theme.fg("muted", "(wrote) ") +
            theme.fg("accent", details.answer),
          0,
          0,
        );
      }

      // Keep the selected position when labels are duplicated. Fall back to the
      // old label-based lookup for results produced by a previous package version.
      const index = details.selectedIndex ?? details.options.indexOf(details.answer);
      const display = index >= 0 ? `${index + 1}. ${details.answer}` : details.answer;
      return new Text(
        theme.fg("success", `${SUCCESS_ICON} `) + theme.fg("accent", display),
        0,
        0,
      );
    },
  });
}
