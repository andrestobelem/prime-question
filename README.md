# prime-question

A small Prime Agent package that adds a `question` tool for asking the user to
choose from options or provide a free-form answer.

The package uses Prime Agent's `pi.extensions` manifest, so installing it makes
the tool available automatically. Its dialogs use `ctx.ui.select()` and
`ctx.ui.input()`. They work in interactive sessions and in daemon/RPC sessions
when the client supports and responds to `extension_ui_request` messages. In
daemon mode, a client must advertise the `extension_ui` capability; without a
capable client, the daemon returns a normal cancellation response. In raw RPC
mode, a client that does not answer the request leaves the dialog pending.

## Install

After publishing to npm:

```sh
prime-agent package install npm:prime-question
```

For a local tarball, use an explicit npm file spec:

```sh
npm pack
prime-agent package install npm:prime-question@file:/absolute/path/prime-question-0.1.4.tgz
```

Restart Prime Agent, or run `/reload`, after installing the package.

This is a Prime Agent extension package, not a standalone Node library. It
requires Node.js 22.19.0 or newer. Prime Agent supplies the optional runtime
peers (`pi-coding-agent`, `pi-tui`, and `typebox`) and resolves them from the
host when it loads the extension. The package is tested with Prime Agent 0.84.2.

## Usage

Ask Prime Agent to use the `question` tool when a decision materially affects
the next step. For example:

```text
Before implementing this, use the question tool to ask which deployment target I prefer.
Offer local, staging, production, and allow a custom answer.
```

The tool accepts at least one option with a label and optional description. It
adds `Type something.` as the final option, so callers should not add that
option themselves. Selecting it opens a text-input dialog. Long question text
wraps inside the dialog and the tool renderer. Text supplied by the model or
user is sanitized before it reaches the terminal renderer. UI failures and
invalid calls are reported as tool errors; an explicit `Esc` or empty answer is
reported as cancellation. The tool bounds questions to 4,000 characters,
labels to 500 characters, descriptions to 1,000 characters, answers to 4,000
characters, and calls to 32 options. The UI uses theme colors and Nerd Font
glyphs for question, success, custom-answer, cancellation, and error states.
With FiraCode Nerd Font Mono, these symbols are included in the terminal font;
Powerline is not a separate font. If the tool execution is aborted, the active
dialog is dismissed as well.

## Development

```sh
npm install
npm run typecheck
npm test
npm run pack:check
```

## License

MIT.
