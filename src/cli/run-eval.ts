/**
 * Eval command runner: loads capsules from a directory and assertions from
 * a YAML file, then checks each capsule against each assertion.
 *
 * YAML parsing uses a minimal subset parser (no external dep) that handles
 * the simple assertions format. For production YAML, consider a real parser.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { deserializeCapsuleArchive } from "../capsule/builder.js";
import { validateCapsule } from "../capsule/validator.js";
import { checkAssertion, type Assertion } from "./eval.js";

/** Result for a single capsule evaluated against all assertions. */
interface CapsuleEvalResult {
  file: string;
  passed: number;
  total: number;
  failures: Array<{ step: string; message: string }>;
}

/**
 * Parse a minimal YAML assertions file.
 *
 * Supports the specific format:
 * ```yaml
 * assertions:
 *   - step: "label"
 *     expect:
 *       key: value
 * ```
 *
 * This is intentionally limited to avoid adding a YAML dependency.
 * Boolean "true"/"false" and numeric values are coerced.
 */
function parseAssertionsYaml(content: string): Assertion[] {
  const assertions: Assertion[] = [];
  const lines = content.split("\n");

  let current: { step?: string; expect: Record<string, unknown> } | null = null;
  let inExpect = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip comments and empty lines
    if (line.trim().startsWith("#") || line.trim() === "") continue;
    // Skip the top-level "assertions:" key
    if (line.trim() === "assertions:") continue;

    // New assertion item
    const stepMatch = line.match(/^\s+-\s+step:\s*"?([^"]+)"?\s*$/);
    if (stepMatch) {
      if (current?.step) {
        assertions.push({ step: current.step, expect: current.expect as Assertion["expect"] });
      }
      current = { step: stepMatch[1]!.trim(), expect: {} };
      inExpect = false;
      continue;
    }

    // expect: block start
    if (line.match(/^\s+expect:\s*$/)) {
      inExpect = true;
      continue;
    }

    // Key-value inside expect block
    if (inExpect && current) {
      const kvMatch = line.match(/^\s+(\w+):\s*"?([^"]*)"?\s*$/);
      if (kvMatch) {
        const key = kvMatch[1]!;
        let value: unknown = kvMatch[2]!.trim();
        // Coerce booleans and numbers
        if (value === "true") value = true;
        else if (value === "false") value = false;
        else if (/^\d+(\.\d+)?$/.test(value as string)) value = Number(value);
        current.expect[key] = value;
      }
    }
  }

  // Push the last assertion
  if (current?.step) {
    assertions.push({ step: current.step, expect: current.expect as Assertion["expect"] });
  }

  return assertions;
}

/**
 * Run the eval command: load capsules, load assertions, check each combination.
 *
 * @param options - CLI options with paths to capsules directory and assertions YAML.
 * @throws {Error} If the capsules directory or assertions file cannot be read.
 */
export async function runEval(
  options: { capsules: string; assertions: string; json?: boolean }
): Promise<void> {
  const assertionsContent = await readFile(options.assertions, "utf-8");
  const assertions = parseAssertionsYaml(assertionsContent);

  if (assertions.length === 0) {
    process.stderr.write("Error: No assertions found in " + options.assertions + "\n");
    process.exitCode = 1;
    return;
  }

  const dirEntries = await readdir(options.capsules);
  const capsuleFiles = dirEntries.filter((f) => f.endsWith(".capsule")).sort();

  if (capsuleFiles.length === 0) {
    process.stderr.write("Error: No .capsule files found in " + options.capsules + "\n");
    process.exitCode = 1;
    return;
  }

  const results: CapsuleEvalResult[] = [];

  for (const file of capsuleFiles) {
    const filePath = join(options.capsules, file);
    const raw = await readFile(filePath, "utf-8");
    const archive = deserializeCapsuleArchive(raw);

    const validation = validateCapsule(archive);
    if (!validation.valid) {
      results.push({
        file,
        passed: 0,
        total: assertions.length,
        failures: [{ step: "*", message: `Capsule validation failed: ${validation.errors.map((e) => e.message).join(", ")}` }],
      });
      continue;
    }

    const failures: Array<{ step: string; message: string }> = [];
    let passed = 0;

    for (const assertion of assertions) {
      const result = checkAssertion(archive, assertion);
      if (result.passed) {
        passed++;
      } else {
        failures.push({ step: assertion.step, message: result.message ?? "unknown failure" });
      }
    }

    results.push({ file, passed, total: assertions.length, failures });
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ capsules: results, assertions: assertions.length }, null, 2) + "\n");
    return;
  }

  // Human-readable output
  const totalCapsules = results.length;
  const passedCapsules = results.filter((r) => r.failures.length === 0).length;
  const failedCapsules = totalCapsules - passedCapsules;

  const lines: string[] = [
    "DBAR Eval Results",
    "\u2550".repeat(17),
    `Capsules: ${totalCapsules} | Assertions: ${assertions.length}`,
    "",
  ];

  for (const result of results) {
    if (result.failures.length === 0) {
      lines.push(`  ${result.file}     \u2713 PASS (${result.passed}/${result.total})`);
    } else {
      lines.push(`  ${result.file}     \u2717 FAIL (${result.passed}/${result.total})`);
      for (const f of result.failures) {
        lines.push(`    \u2717 step "${f.step}": ${f.message}`);
      }
    }
  }

  lines.push("", `Summary: ${passedCapsules}/${totalCapsules} passed, ${failedCapsules}/${totalCapsules} failed`);
  process.stdout.write(lines.join("\n") + "\n");

  if (failedCapsules > 0) {
    process.exitCode = 1;
  }
}
