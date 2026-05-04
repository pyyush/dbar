import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = join(repoRoot, "scripts", "prepare-release-version.mjs");

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "dbar-release-version-"));
  mkdirSync(join(root, "python", "dbar"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@pyyush/dbar", version: "1.0.0" }, null, 2) + "\n",
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify(
      {
        name: "@pyyush/dbar",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: {
          "": {
            name: "@pyyush/dbar",
            version: "1.0.0",
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(root, "python", "pyproject.toml"), '[project]\nversion = "1.0.0"\n');
  writeFileSync(join(root, "python", "dbar", "_version.py"), '__version__ = "1.0.0"\n');
  return root;
}

function readFixture(root: string) {
  return {
    packageJson: JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string },
    packageLock: JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version: string }>;
    },
    pyproject: readFileSync(join(root, "python", "pyproject.toml"), "utf8"),
    pythonVersion: readFileSync(join(root, "python", "dbar", "_version.py"), "utf8"),
  };
}

function runPrepare(root: string, tag: string) {
  return execFileSync(process.execPath, [scriptPath, "--root", root, "--tag", tag], {
    encoding: "utf8",
  });
}

describe("release version policy", () => {
  it("keeps final release metadata aligned across npm and Python", () => {
    const root = makeFixture();
    try {
      const output = JSON.parse(runPrepare(root, "v1.0.0")) as {
        githubPrerelease: boolean;
        npmDistTag: string;
        npmVersion: string;
        pythonVersion: string;
      };
      const fixture = readFixture(root);

      expect(output).toMatchObject({
        githubPrerelease: false,
        npmDistTag: "latest",
        npmVersion: "1.0.0",
        pythonVersion: "1.0.0",
      });
      expect(fixture.packageJson.version).toBe("1.0.0");
      expect(fixture.packageLock.version).toBe("1.0.0");
      expect(fixture.packageLock.packages[""]).toMatchObject({ version: "1.0.0" });
      expect(fixture.pyproject).toContain('version = "1.0.0"');
      expect(fixture.pythonVersion).toContain('__version__ = "1.0.0"');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("maps RC tags from npm SemVer to Python PEP 440", () => {
    const root = makeFixture();
    try {
      const output = JSON.parse(runPrepare(root, "v1.0.0-rc.2")) as {
        githubPrerelease: boolean;
        npmDistTag: string;
        npmVersion: string;
        pythonVersion: string;
      };
      const fixture = readFixture(root);

      expect(output).toMatchObject({
        githubPrerelease: true,
        npmDistTag: "next",
        npmVersion: "1.0.0-rc.2",
        pythonVersion: "1.0.0rc2",
      });
      expect(fixture.packageJson.version).toBe("1.0.0-rc.2");
      expect(fixture.packageLock.version).toBe("1.0.0-rc.2");
      expect(fixture.packageLock.packages[""]).toMatchObject({ version: "1.0.0-rc.2" });
      expect(fixture.pyproject).toContain('version = "1.0.0rc2"');
      expect(fixture.pythonVersion).toContain('__version__ = "1.0.0rc2"');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
