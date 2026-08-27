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

type StoredQuestionDetails = Pick<QuestionDetails, "options" | "answer" | "wasCustom"> &
  Partial<Pick<QuestionDetails, "status" | "selectedIndex">>;

const CUSTOM_ICON = "";
const CUSTOM_OPTION = `${CUSTOM_ICON} Type something.`;
const QUESTION_ICON = "";
const SUCCESS_ICON = "";
const CANCEL_ICON = "";
const ERROR_ICON = "";
const POWERLINE_SEPARATOR = "";
const MAX_OPTIONS = 32;
const MAX_QUESTION_LENGTH = 4_000;
const MAX_OPTION_LABEL_LENGTH = 500;
const MAX_OPTION_DESCRIPTION_LENGTH = 1_000;
const MAX_ANSWER_LENGTH = 4_000;
const MAX_RAW_TEXT_LENGTH = 64_000;

/** Remove terminal control sequences before untrusted text reaches the UI. */
function sanitizeDisplayText(value: string, maxLength = MAX_QUESTION_LENGTH): string {
  const boundedValue =
    value.length > MAX_RAW_TEXT_LENGTH ? value.slice(0, MAX_RAW_TEXT_LENGTH) : value;
  return boundedValue
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u009d[\s\S]*?(?:\u0007|\u009c)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isStoredQuestionDetails(value: unknown): value is StoredQuestionDetails {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredQuestionDetails>;
  return (
    Array.isArray(candidate.options) &&
    candidate.options.length <= MAX_OPTIONS &&
    candidate.options.every((option) => typeof option === "string") &&
    (candidate.answer === null || typeof candidate.answer === "string") &&
    typeof candidate.wasCustom === "boolean"
  );
}

const OptionSchema = Type.Object({
  label: Type.String({
    description: "Display label for the option",
    maxLength: MAX_OPTION_LABEL_LENGTH,
  }),
  description: Type.Optional(
    Type.String({
      description: "Optional helper text shown with the option",
      maxLength: MAX_OPTION_DESCRIPTION_LENGTH,
    }),
  ),
});

const QuestionParams = Type.Object({
  question: Type.String({
    description: "The question to ask the user",
    maxLength: MAX_QUESTION_LENGTH,
  }),
  options: Type.Array(OptionSchema, {
    description: "Options for the user to choose from",
    minItems: 1,
    maxItems: MAX_OPTIONS,
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

export default function question(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "question",
    label: "Question",
    description:
      "Ask the user a question and let them pick from options or enter a custom answer. The custom-answer option is added automatically. Use when user input materially affects the next step.",
    promptSnippet: "Ask the user a clarifying question through the terminal UI when a decision affects the next step",
    promptGuidelines: [
      "Use question when user preferences materially affect the plan, scope, platform, or implementation path.",
      "Prefer 2-4 concrete options instead of guessing when a choice matters.",
      "Include enough context in the question and option labels for the user to decide quickly.",
      "Do not add a custom-answer option yourself; the tool adds it automatically.",
    ],
    executionMode: "sequential",
    parameters: QuestionParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params.options.length > MAX_OPTIONS) {
        throw new Error(`Too many options (maximum ${MAX_OPTIONS})`);
      }

      const questionText = sanitizeDisplayText(params.question, MAX_QUESTION_LENGTH);
      const safeOptions = params.options.map((option) => ({
        label: sanitizeDisplayText(option.label, MAX_OPTION_LABEL_LENGTH),
        description:
          option.description === undefined
            ? undefined
            : sanitizeDisplayText(option.description, MAX_OPTION_DESCRIPTION_LENGTH),
      }));
      const options = safeOptions.map((option) => option.label);

      if (!ctx.hasUI) {
        throw new Error("UI not available (running in non-interactive mode)");
      }

      if (safeOptions.length === 0) {
        throw new Error("No options provided");
      }

      if (signal?.aborted) {
        return cancelledResult(questionText, options);
      }

      // Keep each selector value unique while showing the answer and its description.
      // The selector truncates long rows to its available width.
      const selectionOptions = safeOptions.map((option, index) => {
        const description = option.description ? ` — ${option.description}` : "";
        return `${index + 1}. ${option.label}${description}`;
      });
      const customOptionIndex = safeOptions.length + 1;
      selectionOptions.push(`${customOptionIndex}. ${CUSTOM_OPTION}`);
      const selectionPrompt = [`${QUESTION_ICON} Question`, questionText].join("\n");
      const selected = await ctx.ui.select(selectionPrompt, selectionOptions, { signal });

      if (signal?.aborted || !selected) {
        return cancelledResult(questionText, options);
      }

      const selectedIndex = selectionOptions.indexOf(selected);
      if (selectedIndex < 0) {
        return cancelledResult(questionText, options);
      }

      if (selectedIndex === safeOptions.length) {
        if (signal?.aborted) {
          return cancelledResult(questionText, options);
        }
        const customAnswer = await ctx.ui.input(
          `${QUESTION_ICON} ${questionText}`,
          "Type your answer",
          { signal },
        );
        if (signal?.aborted) {
          return cancelledResult(questionText, options);
        }
        const answer =
          typeof customAnswer === "string"
            ? sanitizeDisplayText(customAnswer, MAX_ANSWER_LENGTH)
            : "";
        if (!answer) {
          return cancelledResult(questionText, options);
        }

        return {
          content: [{ type: "text" as const, text: `User wrote: ${answer}` }],
          details: {
            question: questionText,
            options,
            answer,
            wasCustom: true,
            status: "answered",
            selectedIndex: null,
          } satisfies QuestionDetails,
        };
      }

      const selectedOption = safeOptions[selectedIndex];
      if (!selectedOption) {
        return cancelledResult(questionText, options);
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
          question: questionText,
          options,
          answer,
          wasCustom: false,
          status: "answered",
          selectedIndex,
        } satisfies QuestionDetails,
      };
    },

    renderCall(args, theme) {
      const options: unknown[] = Array.isArray(args.options)
        ? args.options.slice(0, MAX_OPTIONS)
        : [];
      const labels = options.map((option) => {
        if (!option || typeof option !== "object") return "(invalid option)";
        const label = (option as OptionWithDescription).label;
        return typeof label === "string"
          ? sanitizeDisplayText(label, MAX_OPTION_LABEL_LENGTH)
          : "(invalid option)";
      });
      const numbered =
        labels.length === 0
          ? []
          : [...labels, CUSTOM_OPTION].map(
              (option, index) => `${index + 1}. ${option}`,
            );
      const questionText =
        typeof args.question === "string"
          ? sanitizeDisplayText(args.question, MAX_QUESTION_LENGTH)
          : "";
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

    renderResult(result, _options, theme, context) {
      const resultText = sanitizeDisplayText(
        result.content.find((item) => item.type === "text")?.text ?? "",
        MAX_ANSWER_LENGTH,
      );
      const detailsValue = result.details;
      const detailsRecord =
        detailsValue && typeof detailsValue === "object"
          ? (detailsValue as Record<string, unknown>)
          : undefined;

      if (context?.isError || detailsRecord?.status === "error") {
        return new Text(
          theme.fg("error", `${ERROR_ICON} `) + theme.fg("muted", resultText),
          0,
          0,
        );
      }

      if (!isStoredQuestionDetails(detailsValue)) {
        return new Text(resultText, 0, 0);
      }
      const details = detailsValue;

      if (details.answer === null) {
        return new Text(
          theme.fg("warning", `${CANCEL_ICON} `) + theme.fg("muted", "Cancelled"),
          0,
          0,
        );
      }

      const answer = sanitizeDisplayText(details.answer, MAX_ANSWER_LENGTH);
      if (details.wasCustom) {
        return new Text(
          theme.fg("success", `${SUCCESS_ICON} `) +
            theme.fg("accent", `${CUSTOM_ICON} `) +
            theme.fg("muted", "(wrote) ") +
            theme.fg("accent", answer),
          0,
          0,
        );
      }

      // Keep the selected position when labels are duplicated. Fall back to the
      // old label-based lookup for results produced by a previous package version.
      const index =
        typeof details.selectedIndex === "number" &&
        Number.isInteger(details.selectedIndex)
          ? details.selectedIndex
          : details.options.indexOf(details.answer);
      const display = index >= 0 ? `${index + 1}. ${answer}` : answer;
      return new Text(
        theme.fg("success", `${SUCCESS_ICON} `) + theme.fg("accent", display),
        0,
        0,
      );
    },
  });
}
