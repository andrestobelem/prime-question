# Changelog

## 0.1.1 - 2026-08-19

### Fixed

- Propagate tool cancellation to the selection and input dialogs.
- Preserve the selected position when options have duplicate labels.
- Render execution failures as errors instead of cancellations.
- Added CI checks for typechecking, tests, and package contents.

## 0.1.0 - 2026-08-16

### Added

- Added the `question` tool for selectable options and free-form answers.
- Added Prime Agent package metadata and automatic extension discovery.
- Added daemon-compatible dialogs through `ctx.ui.select()` and `ctx.ui.input()`.
