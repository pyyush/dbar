# Contributing

DBAR is the evidence layer for browser workflows: failed run, replay, first
divergence, reusable regression artifact. Keep contributions inside that loop.

## Before You Start

- Open or reference an issue for behavior changes.
- Keep browser-harness optional interop only. Do not add it as a dependency,
  backend, release gate, or CI matrix entry.
- Do not claim Firefox, WebKit, WebSocket, SSE, service-worker, IndexedDB, or
  download replay support unless the implementation and tests prove it.

## Local Verification

Run the root package checks from the repo root:

```bash
npm install
npm run build
npm run typecheck
npm test
npm run performance
npm run lint
npm run coverage
npm audit
```

If you touch `python/`:

```bash
python3 -m pip install -e "./python[dev]" build twine
python3 -m pytest python/tests
rm -rf python/dist python/build python/*.egg-info
cd python
python3 -m build
python3 -m twine check dist/*
```

If you touch integration packages, run their package-local checks:

```bash
npm --prefix integrations/browser-use install
npm --prefix integrations/browser-use run typecheck
npm --prefix integrations/browser-use test
npm --prefix integrations/browserbase install
npm --prefix integrations/browserbase test
```

## Pull Requests

- Update tests and docs with behavior changes.
- Include migration notes for breaking API, CLI, or capsule changes.
- Include safe-sharing and threat-model notes for new untrusted input surfaces.
- Do not commit generated `dist/`, package archives, local operator state, or
  dependency directories.
