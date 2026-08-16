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
}

const CUSTOM_OPTION = "Type something.";

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

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const options = params.options.map((option) => option.label);
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: UI not available (running in non-interactive mode)",
            },
          ],
          details: {
            question: params.question,
            options,
            answer: null,
            wasCustom: false,
          } satisfies QuestionDetails,
        };
      }

      if (params.options.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Error: No options provided" }],
          details: {
            question: params.question,
            options: [],
            answer: null,
            wasCustom: false,
          } satisfies QuestionDetails,
        };
      }

      const displayOptions = params.options.map((option) =>
        option.description ? `${option.label} — ${option.description}` : option.label,
      );
      const selected = await ctx.ui.select(params.question, [
        ...displayOptions,
        CUSTOM_OPTION,
      ]);

      if (!selected) {
        return cancelledResult(params.question, options);
      }

      if (selected === CUSTOM_OPTION) {
        const customAnswer = await ctx.ui.input(params.question, "Type your answer");
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
          } satisfies QuestionDetails,
        };
      }

      const selectedIndex = displayOptions.indexOf(selected);
      const selectedOption = params.options[selectedIndex];
      const answer = selectedOption?.label ?? selected;

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
        } satisfies QuestionDetails,
      };
    },

    renderCall(args, theme) {
      const options = Array.isArray(args.options) ? args.options : [];
      const labels = options.map((option: OptionWithDescription) => option.label);
      const numbered = [...labels, CUSTOM_OPTION].map(
        (option, index) => `${index + 1}. ${option}`,
      );
      const questionText = typeof args.question === "string" ? args.question : "";
      let text =
        theme.fg("toolTitle", theme.bold("question ")) +
        theme.fg("muted", questionText);
      if (numbered.length > 0) {
        text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as QuestionDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.answer === null) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }

      if (details.wasCustom) {
        return new Text(
          theme.fg("success", "✓ ") +
            theme.fg("muted", "(wrote) ") +
            theme.fg("accent", details.answer),
          0,
          0,
        );
      }

      const index = details.options.indexOf(details.answer) + 1;
      const display = index > 0 ? `${index}. ${details.answer}` : details.answer;
      return new Text(theme.fg("success", "✓ ") + theme.fg("accent", display), 0, 0);
    },
  });
}
