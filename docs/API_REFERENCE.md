# DBAR API Reference

This page records the 1.0.0 API stability boundary. The generated TypeScript
declarations in `dist/index.d.ts` are the source of truth after `npm run build`.
Hosted API reference publishing is a release-pipeline gate; until that job is
live, use this page together with the generated declarations.

## Package Exports

The npm package exposes:

- `@pyyush/dbar`
- `@pyyush/dbar/package.json`

Deep imports from `dist/`, `src/`, tests, fixtures, or implementation files are
internal and unsupported.

## Stable TypeScript API

- `DBAR.capture(page, options?)`
- `DBAR.startReplay(page, archive, options?)`
- `DBAR.replay(page, archive, options?)`
- `DBAR.validate(archive)`
- `DBAR.validateFromBlob(blob)`
- `DBAR.serialize(archive)`
- `DBAR.deserialize(blob)`
- `CaptureSession`
- `ReplaySession`
- `ReplayOptions`
- `ReplayStepResult`
- `buildCapsule(input)`
- `serializeCapsuleArchive(archive)`
- `deserializeCapsuleArchive(blob)`
- `validateCapsule(archive)`
- `CapsuleBuildInput`
- `CapsuleArchive`

Stable data contracts exported from the root package:

- `DeterminismCapsule`
- `EnvironmentDescriptor`
- `SeedPackage`
- `InitialState`
- `NetworkEntry`
- `NetworkTranscript`
- `CapsuleStep`
- `StepAction`
- `StepObservables`
- `StepArtifacts`
- `CapsuleMetrics`
- `CapsuleCookie`
- `Divergence`
- `DivergenceType`
- `StepSnapshot`
- `ReplayResult`
- `ValidationResult`
- Matching Zod schemas for those contracts

## Stable CLI

- `dbar validate <capsule-path>`
- `dbar replay <capsule-path> [--cost] [--json]`
- `dbar eval --capsules <dir> --assertions <yaml-path> [--json]`
- `dbar --help`
- `dbar --version`

Root CLI exit code `0` means the command completed successfully. Exit code `1`
means either a blocking replay divergence, validation failure, assertion
failure, malformed input, missing browser, or command-level fatal error,
depending on the command.

The Browserbase integration CLI documents a separate `0`/`1`/`2` convention in
`integrations/browserbase/README.md`.

## Experimental TypeScript API

These exports exist for custom integrations, but constructor options,
diagnostics, and exact implementation behavior may change in a minor release if
the stable SDK and capsule contracts remain compatible:

- `Coordinator`
- `TimeVirtualizer`
- `NetworkRecorder`
- `NetworkReplayer`
- `captureDOMSnapshot`
- `captureAccessibilitySnapshot`
- `captureScreenshot`
- `captureStorageState`
- `restoreStorageState`
- `TraceTimeline`
- `createTranscript`
- `hashRequest`
- `hashBody`
- `hashBuffer`
- `redactHeaders`
- `isSSE`
- `isWebSocket`

## Internal Surfaces

- Minimal YAML parsing behind `dbar eval`
- Redaction internals
- Benchmark fixtures and test helpers
- Generated `dist/` file names
- Browser-harness example code

Browser-harness remains docs-only live-runner interop for 1.0.0. It is not a
DBAR dependency, backend, release gate, or CI matrix.

## Python API

The Python package is a recorder/diff lane for browser-use workflows. It is not
the root deterministic replay engine.

Stable Python exports for 1.0.0:

- `DBARRecorder`
- `Capsule`
- `__version__`

Python modules outside the package root exports are implementation details
unless a later release explicitly promotes them.
