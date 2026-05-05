# DBAR Examples

These examples are meant to be runnable from a clean project or from a DBAR
checkout after the package is built.

## Clean Project

```bash
mkdir dbar-examples
cd dbar-examples
npm init -y
npm install @pyyush/dbar playwright
npx playwright install chromium
```

Then copy one of the `.mjs` files in this directory and run it with Node.js 20
or newer:

```bash
node 01-capture-validate-replay.mjs
```

## Package Checkout

From the repository root:

```bash
npm install
npm run build
npm install --no-save playwright
npx playwright install chromium
node examples/01-capture-validate-replay.mjs
```

The examples import `@pyyush/dbar` through the package export, so a checkout
must be built before running them locally.

## Files

- `01-capture-validate-replay.mjs`: capture a page load, validate the capsule,
  write it to disk, and replay the same navigation boundary.
- `02-capture-on-failure.mjs`: keep a capsule only when the run fails or when
  `DBAR_KEEP_HIGH_VALUE=1` is set.
- `03-step-by-step-replay.mjs`: capture and replay a multi-step workflow by
  interleaving Playwright actions with DBAR replay steps.

Artifacts are written under `examples/artifacts/` when the examples are run
from this repository.
