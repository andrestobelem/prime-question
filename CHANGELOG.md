# Changelog

## 0.1.4 - 2026-08-27

### Fixed

- Sanitize question text, option labels, descriptions, and answers before terminal rendering.
- Report unavailable UI, invalid calls, and dialog failures as real tool errors.
- Handle Prime Agent error results with empty `details` objects without throwing.
- Keep the custom-answer renderer consistent with the minimum option requirement.
- Bound user-controlled text and option counts to avoid unbounded UI output.
- Add a packed-installation smoke test and align the Node requirement with the host.

## 0.1.3 - 2026-08-19

### Fixed

- Apply semantic theme colors to question options and result states.
- Added regression coverage for themed rendering.


## 0.1.2 - 2026-08-19

### Added

- Added Nerd Font symbols and a Powerline-thin separator to the question UI.
- Documented wrapped prompts and terminal font requirements.


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
