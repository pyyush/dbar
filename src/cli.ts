#!/usr/bin/env node
/**
 * DBAR CLI — Deterministic Browser Agent Runtime command-line interface.
 *
 * Commands:
 *   dbar replay <capsule-path> [--cost] [--json]   Replay a capsule
 *   dbar eval --capsules <dir> --assertions <yaml>  Evaluate capsules against assertions
 *   dbar validate <capsule-path>                    Validate a capsule
 *   dbar --help                                     Show help
 *   dbar --version                                  Show version
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "./cli/args.js";
import { runReplay } from "./cli/replay.js";
import { runEval } from "./cli/run-eval.js";
import { deserializeCapsuleArchive } from "./capsule/builder.js";
import { validateCapsule } from "./capsule/validator.js";

const HELP_TEXT = `DBAR — Deterministic Browser Agent Runtime

Usage:
  dbar replay <capsule-path> [--cost] [--json]
    Replay a capsule and output results.
    --cost    Show cost comparison (original vs. replay)
    --json    Output results as JSON

  dbar eval --capsules <dir> --assertions <yaml-path> [--json]
    Evaluate capsules against assertions.

  dbar validate <capsule-path>
    Validate a capsule for structural integrity.

  dbar --help       Show this help message
  dbar --version    Show version
`;

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv);

  switch (cmd.command) {
    case "help":
      process.stdout.write(HELP_TEXT);
      return;

    case "version": {
      const pkgPath = new URL("../package.json", import.meta.url);
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { version: string };
      process.stdout.write(pkg.version + "\n");
      return;
    }

    case "replay":
      await runReplay(cmd.capsulePath, cmd.options);
      return;

    case "eval":
      await runEval(cmd.options);
      return;

    case "validate": {
      const raw = await readFile(cmd.capsulePath, "utf-8");
      const archive = deserializeCapsuleArchive(raw);
      const result = validateCapsule(archive);

      if (result.valid) {
        process.stdout.write("Capsule is valid.\n");
        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            process.stderr.write(`Warning [${w.path}]: ${w.message}\n`);
          }
        }
      } else {
        process.stderr.write("Capsule validation failed:\n");
        for (const e of result.errors) {
          process.stderr.write(`  Error [${e.path}]: ${e.message}\n`);
        }
        for (const w of result.warnings) {
          process.stderr.write(`  Warning [${w.path}]: ${w.message}\n`);
        }
        process.exitCode = 1;
      }
      return;
    }

    case "error":
      process.stderr.write("Error: " + cmd.message + "\n");
      process.exitCode = 1;
      return;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write("Fatal: " + message + "\n");
  process.exitCode = 1;
});
