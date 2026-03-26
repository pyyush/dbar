/**
 * Raw argv parser for the DBAR CLI. No external dependencies (no commander/yargs).
 *
 * @example
 * ```ts
 * const cmd = parseArgs(process.argv);
 * if (cmd.command === "replay") { ... }
 * ```
 */

/** Discriminated union of all parsed CLI commands. */
export type ParsedCommand =
  | { command: "replay"; capsulePath: string; options: { cost: boolean; json: boolean } }
  | { command: "eval"; options: { capsules: string; assertions: string; json: boolean } }
  | { command: "validate"; capsulePath: string }
  | { command: "help" }
  | { command: "version" }
  | { command: "error"; message: string };

/**
 * Parse process.argv into a structured command descriptor.
 *
 * @param argv - Raw argv array (includes node binary and script path at [0] and [1]).
 * @returns A {@link ParsedCommand} describing which subcommand to run and its arguments.
 */
export function parseArgs(argv: string[]): ParsedCommand {
  const args = argv.slice(2);

  if (args.length === 0) {
    return { command: "error", message: 'No command provided. Run "dbar --help" for usage.' };
  }

  const first = args[0]!;

  if (first === "--help" || first === "-h") {
    return { command: "help" };
  }
  if (first === "--version" || first === "-v") {
    return { command: "version" };
  }

  if (first === "replay") {
    const capsulePath = args.find((a) => !a.startsWith("--"));
    if (!capsulePath || capsulePath === "replay") {
      // Look for a positional arg after "replay"
      const positional = args.slice(1).find((a) => !a.startsWith("--"));
      if (!positional) {
        return {
          command: "error",
          message: "replay requires a capsule path. Usage: dbar replay <capsule-path> [--cost] [--json]",
        };
      }
      return {
        command: "replay",
        capsulePath: positional,
        options: {
          cost: args.includes("--cost"),
          json: args.includes("--json"),
        },
      };
    }
    return {
      command: "replay",
      capsulePath: args[1]!,
      options: {
        cost: args.includes("--cost"),
        json: args.includes("--json"),
      },
    };
  }

  if (first === "eval") {
    const capsulesIdx = args.indexOf("--capsules");
    const assertionsIdx = args.indexOf("--assertions");
    const capsules = capsulesIdx >= 0 ? args[capsulesIdx + 1] : undefined;
    const assertions = assertionsIdx >= 0 ? args[assertionsIdx + 1] : undefined;

    if (!capsules || !assertions) {
      return {
        command: "error",
        message: "eval requires --capsules and --assertions. Usage: dbar eval --capsules <dir> --assertions <yaml-path> [--json]",
      };
    }

    return {
      command: "eval",
      options: {
        capsules,
        assertions,
        json: args.includes("--json"),
      },
    };
  }

  if (first === "validate") {
    const positional = args.slice(1).find((a) => !a.startsWith("--"));
    if (!positional) {
      return {
        command: "error",
        message: "validate requires a capsule path. Usage: dbar validate <capsule-path>",
      };
    }
    return { command: "validate", capsulePath: positional };
  }

  return { command: "error", message: `Unknown command "${first}". Run "dbar --help" for usage.` };
}
