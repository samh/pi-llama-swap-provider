# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
