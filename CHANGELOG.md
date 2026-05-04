# Changelog

## 1.0.0 (planned)

### Added

- added runnable capture/replay examples for quick start, capture-on-failure, and step-by-step replay workflows
- added migration, troubleshooting, security, API reference, and browser-harness ADR documentation for the 1.0.0 release path
- documented the five-minute install-to-first-capsule path, debugging sequence, unsupported browser surface table, and production evidence checklist

### Changed

- set the Python package metadata and runtime `__version__` to `1.0.0`
- documented that the Python package is recorder/diff evidence only, while deterministic replay remains in the TypeScript package
- made PyPI availability claims conditional on the first successful `1.0.0` PyPI publication and external install verification
- added release workflow checks that `python/pyproject.toml` and `dbar.__version__` match the release tag

## 0.2.0

### Added

- stronger replay verification tests for network, divergence accounting, and replay summaries
- browser-use integration coverage for focused-target capture and current `on_step_end` usage
- release-prep install guidance for npm and the planned PyPI lane

### Changed

- repositioned DBAR around replayable proof for production browser agents
- aligned the Python recorder with `browser-use >=0.12.5,<0.13`
- updated the browser-use sidecar to attach via the real `browser.cdp_url` and capture the currently focused target
- synced integration package dependencies to the current `@pyyush/dbar` release line

### Fixed

- strict replay now verifies live network digests instead of copying recorded values
- replay success metrics now treat strict divergences as real step failures
- screenshot drift remains advisory instead of failing replay success
- browser-use docs/examples no longer rely on stale hook or fixed-port assumptions
