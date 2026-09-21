# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- Expose the extension through a root entry point so pi displays the package
  without a `:src` suffix.

## [0.1.1] - 2026-09-21

### Fixed

- Load the OpenAI Responses adapter through pi's supported compatibility export
  so Git-installed packages work without their own pi-ai dependency.
- Verify extension loading from the packed artifact without development
  dependencies.

## [0.1.0] - 2026-09-21

### Added

- Initial package scaffolding.
- URL normalization, credential resolution, and model discovery foundations.
- Responses event normalization and prompt-progress calculation.
- Opt-in live transport tests.
- Automatic model refresh after interactive login.

### Changed

- Preload environment-configured catalogues during extension initialization so
  first-run `pi --list-models` works with pi 0.86.
