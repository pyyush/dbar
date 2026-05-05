import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { deserializeCapsuleArchive } from "@pyyush/dbar";

const execFileAsync = promisify(execFile);
const hasBrowserbaseCredentials = Boolean(
  process.env["BROWSERBASE_API_KEY"] && process.env["BROWSERBASE_PROJECT_ID"]
);
const runWhenCredentialsExist = hasBrowserbaseCredentials ? it : it.skip;

describe("Browserbase live capture smoke", () => {
  runWhenCredentialsExist(
    "captures a replay capsule when Browserbase credentials are present",
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), "dbar-browserbase-smoke-"));
      const outputPath = join(outputDir, "smoke.capsule");

      try {
        await execFileAsync(
          "npm",
          [
            "run",
            "capture",
            "--",
            "--url",
            "https://example.com",
            "--steps",
            "1",
            "--output",
            outputPath,
          ],
          {
            cwd: new URL("..", import.meta.url),
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
          }
        );

        const capsule = await readFile(outputPath, "utf8");
        const archive = deserializeCapsuleArchive(capsule);

        expect(archive.manifest.capsuleProfile).toBe("replay");
        expect(archive.manifest.steps).toHaveLength(1);
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    },
    130_000
  );
});
