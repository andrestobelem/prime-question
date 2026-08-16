# Agent guide

## Purpose

`prime-question` is a small, publishable Prime Agent package that exposes the
`question` tool through the `pi.extensions` manifest.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run pack:check
```

`dist/` is generated and ignored. Run `npm run build` before testing a packed
installation; `prepack` rebuilds it automatically before publishing.

## Conventions

- Keep the public tool name and UI strings in English.
- Preserve compatibility with Prime Agent daemon mode: use `ctx.ui.select()` and
  `ctx.ui.input()` for interactive dialogs; `ctx.ui.custom()` is not available in
  the daemon extension binding.
- Keep dependencies as peer dependencies so Prime Agent provides the host API.
- Use conventional commits with a scope and do not add co-author attributions.
