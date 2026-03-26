import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli/args.js";

describe("parseArgs", () => {
  it("should parse replay command with capsule path", () => {
    const result = parseArgs(["node", "dbar", "replay", "my.capsule"]);
    expect(result).toEqual({
      command: "replay",
      capsulePath: "my.capsule",
      options: { cost: false, json: false },
    });
  });

  it("should parse replay command with --cost flag", () => {
    const result = parseArgs(["node", "dbar", "replay", "my.capsule", "--cost"]);
    expect(result).toEqual({
      command: "replay",
      capsulePath: "my.capsule",
      options: { cost: true, json: false },
    });
  });

  it("should parse replay command with --json flag", () => {
    const result = parseArgs(["node", "dbar", "replay", "my.capsule", "--json"]);
    expect(result).toEqual({
      command: "replay",
      capsulePath: "my.capsule",
      options: { cost: false, json: true },
    });
  });

  it("should parse replay command with both --cost and --json", () => {
    const result = parseArgs(["node", "dbar", "replay", "my.capsule", "--cost", "--json"]);
    expect(result).toEqual({
      command: "replay",
      capsulePath: "my.capsule",
      options: { cost: true, json: true },
    });
  });

  it("should parse eval command with required options", () => {
    const result = parseArgs([
      "node", "dbar", "eval",
      "--capsules", "./caps",
      "--assertions", "./asserts.yaml",
    ]);
    expect(result).toEqual({
      command: "eval",
      options: { capsules: "./caps", assertions: "./asserts.yaml", json: false },
    });
  });

  it("should parse eval command with --json flag", () => {
    const result = parseArgs([
      "node", "dbar", "eval",
      "--capsules", "./caps",
      "--assertions", "./asserts.yaml",
      "--json",
    ]);
    expect(result).toEqual({
      command: "eval",
      options: { capsules: "./caps", assertions: "./asserts.yaml", json: true },
    });
  });

  it("should parse validate command with capsule path", () => {
    const result = parseArgs(["node", "dbar", "validate", "my.capsule"]);
    expect(result).toEqual({
      command: "validate",
      capsulePath: "my.capsule",
    });
  });

  it("should parse --help flag", () => {
    const result = parseArgs(["node", "dbar", "--help"]);
    expect(result).toEqual({ command: "help" });
  });

  it("should parse --version flag", () => {
    const result = parseArgs(["node", "dbar", "--version"]);
    expect(result).toEqual({ command: "version" });
  });

  it("should return error when no command provided", () => {
    const result = parseArgs(["node", "dbar"]);
    expect(result).toEqual({
      command: "error",
      message: 'No command provided. Run "dbar --help" for usage.',
    });
  });

  it("should return error when replay missing capsule path", () => {
    const result = parseArgs(["node", "dbar", "replay"]);
    expect(result).toEqual({
      command: "error",
      message: 'replay requires a capsule path. Usage: dbar replay <capsule-path> [--cost] [--json]',
    });
  });

  it("should return error when eval missing --capsules", () => {
    const result = parseArgs(["node", "dbar", "eval", "--assertions", "a.yaml"]);
    expect(result).toEqual({
      command: "error",
      message: 'eval requires --capsules and --assertions. Usage: dbar eval --capsules <dir> --assertions <yaml-path> [--json]',
    });
  });

  it("should return error when eval missing --assertions", () => {
    const result = parseArgs(["node", "dbar", "eval", "--capsules", "./caps"]);
    expect(result).toEqual({
      command: "error",
      message: 'eval requires --capsules and --assertions. Usage: dbar eval --capsules <dir> --assertions <yaml-path> [--json]',
    });
  });

  it("should return error when validate missing capsule path", () => {
    const result = parseArgs(["node", "dbar", "validate"]);
    expect(result).toEqual({
      command: "error",
      message: 'validate requires a capsule path. Usage: dbar validate <capsule-path>',
    });
  });

  it("should return error for unknown command", () => {
    const result = parseArgs(["node", "dbar", "unknown"]);
    expect(result).toEqual({
      command: "error",
      message: 'Unknown command "unknown". Run "dbar --help" for usage.',
    });
  });
});
