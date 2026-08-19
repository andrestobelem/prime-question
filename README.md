# prime-question

A small Prime Agent package that adds a `question` tool for asking the user to
choose from options or provide a free-form answer.

The package uses Prime Agent's `pi.extensions` manifest, so installing it makes
the tool available automatically. Its dialogs use `ctx.ui.select()` and
`ctx.ui.input()`, which work in both interactive and daemon sessions.

## Install

After publishing to npm:

```sh
prime-agent package install npm:prime-question
```

For a local tarball, use an explicit npm file spec:

```sh
npm pack
prime-agent package install npm:prime-question@file:/absolute/path/prime-question-0.1.0.tgz
```

Restart Prime Agent, or run `/reload`, after installing the package.

## Usage

Ask Prime Agent to use the `question` tool when a decision materially affects
the next step. For example:

```text
Before implementing this, use the question tool to ask which deployment target I prefer.
Offer local, staging, production, and allow a custom answer.
```

The tool accepts options with labels and optional descriptions. It adds
`Type something.` as the final option. Selecting it opens a text-input dialog.
Long question text wraps inside the dialog and the tool renderer. Press `Esc` to
cancel either dialog. If the tool execution is aborted, the active dialog is
dismissed as well.

## Development

```sh
npm install
npm run typecheck
npm test
npm run pack:check
```

## License

MIT.
