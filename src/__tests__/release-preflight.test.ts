import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tagScriptPath = join(repoRoot, "scripts", "check-release-tag.mjs");
const registryScriptPath = join(repoRoot, "scripts", "check-release-registries.mjs");

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function makeGitFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "dbar-release-tag-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "release-test@example.com"]);
  git(root, ["config", "user.name", "Release Test"]);
  writeFileSync(join(root, "README.md"), "main\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "initial"]);
  git(root, ["branch", "-M", "main"]);
  return root;
}

async function runRegistryPreflight(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Expected an IPv4 test server address.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await execFileAsync(process.execPath, [
      registryScriptPath,
      "--npm-package",
      "@pyyush/dbar",
      "--npm-version",
      "1.0.0",
      "--pypi-package",
      "dbar",
      "--python-version",
      "1.0.0",
      "--npm-registry-url",
      `${baseUrl}/npm`,
      "--pypi-json-url",
      `${baseUrl}/pypi/dbar/json`,
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

describe("release tag preflight", () => {
  it("allows v tags that are reachable from the default branch", () => {
    const root = makeGitFixture();
    try {
      git(root, ["tag", "v1.0.0"]);

      const output = execFileSync(
        process.execPath,
        [tagScriptPath, "--root", root, "--tag", "v1.0.0", "--default-branch", "main"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );

      expect(output).toContain("v1.0.0");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  }, 30_000);

  it("rejects v tags that are not reachable from the default branch", () => {
    const root = makeGitFixture();
    try {
      git(root, ["switch", "-c", "release-only"]);
      writeFileSync(join(root, "README.md"), "release-only\n");
      git(root, ["commit", "-am", "release-only"]);
      git(root, ["tag", "v1.0.1"]);

      expect(() =>
        execFileSync(
          process.execPath,
          [tagScriptPath, "--root", root, "--tag", "v1.0.1", "--default-branch", "main"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      ).toThrow();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  }, 30_000);
});

describe("release registry preflight", () => {
  it("allows an unpublished npm version and first-time PyPI project", async () => {
    await expect(
      runRegistryPreflight((request, response) => {
        if (request.url?.startsWith("/npm/")) {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ name: "@pyyush/dbar", versions: { "0.2.0": {} } }));
          return;
        }

        response.statusCode = 404;
        response.end("not found");
      }),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("PyPI project dbar does not exist yet"),
    });
  }, 30_000);

  it("rejects already-published release versions", async () => {
    await expect(
      runRegistryPreflight((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url?.startsWith("/npm/")) {
          response.end(JSON.stringify({ name: "@pyyush/dbar", versions: { "1.0.0": {} } }));
          return;
        }

        response.end(JSON.stringify({ info: { name: "dbar" }, releases: {} }));
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("@pyyush/dbar@1.0.0 already exists on npm"),
    });

    await expect(
      runRegistryPreflight((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url?.startsWith("/npm/")) {
          response.end(JSON.stringify({ name: "@pyyush/dbar", versions: { "0.2.0": {} } }));
          return;
        }

        response.end(JSON.stringify({ info: { name: "dbar" }, releases: { "1.0.0": [] } }));
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("dbar==1.0.0 already exists on PyPI"),
    });
  }, 30_000);
});
