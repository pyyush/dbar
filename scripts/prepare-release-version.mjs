import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    check: false,
    githubOutput: undefined,
    root: process.cwd(),
    tag: process.env.GITHUB_REF_NAME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--github-output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--github-output requires a path");
      }
      options.githubOutput = value;
      index += 1;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a path");
      }
      options.root = value;
      index += 1;
      continue;
    }
    if (arg === "--tag") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--tag requires a version tag");
      }
      options.tag = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.tag) {
    throw new Error("Release tag missing. Pass --tag or set GITHUB_REF_NAME.");
  }

  options.root = path.resolve(options.root);
  return options;
}

function parseTag(tag) {
  const finalMatch = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (finalMatch) {
    const stableVersion = `${finalMatch[1]}.${finalMatch[2]}.${finalMatch[3]}`;
    return {
      githubPrerelease: false,
      npmDistTag: "latest",
      npmVersion: stableVersion,
      pythonVersion: stableVersion,
      stableVersion,
      tag,
    };
  }

  const rcMatch = /^v(\d+)\.(\d+)\.(\d+)-rc\.([1-9]\d*)$/.exec(tag);
  if (rcMatch) {
    const stableVersion = `${rcMatch[1]}.${rcMatch[2]}.${rcMatch[3]}`;
    const rcNumber = rcMatch[4];
    return {
      githubPrerelease: true,
      npmDistTag: "next",
      npmVersion: `${stableVersion}-rc.${rcNumber}`,
      pythonVersion: `${stableVersion}rc${rcNumber}`,
      stableVersion,
      tag,
    };
  }

  throw new Error(
    `Unsupported release tag "${tag}". Use vX.Y.Z for final releases or vX.Y.Z-rc.N for release candidates.`,
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceVersionLine(text, pattern, replacement, filePath) {
  if (!pattern.test(text)) {
    throw new Error(`Could not find version line in ${filePath}`);
  }
  return text.replace(pattern, replacement);
}

function currentVersions(root) {
  const packageJsonPath = path.join(root, "package.json");
  const packageLockPath = path.join(root, "package-lock.json");
  const pyprojectPath = path.join(root, "python", "pyproject.toml");
  const pythonVersionPath = path.join(root, "python", "dbar", "_version.py");

  const packageJson = readJson(packageJsonPath);
  const packageLock = readJson(packageLockPath);
  const pyproject = fs.readFileSync(pyprojectPath, "utf8");
  const pythonVersion = fs.readFileSync(pythonVersionPath, "utf8");

  const pyprojectMatch = /^version = "([^"]+)"$/m.exec(pyproject);
  const pythonRuntimeMatch = /^__version__ = "([^"]+)"$/m.exec(pythonVersion);

  return {
    npm: packageJson.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.[""]?.version,
    python: pyprojectMatch?.[1],
    pythonRuntime: pythonRuntimeMatch?.[1],
  };
}

function applyVersions(root, release) {
  const packageJsonPath = path.join(root, "package.json");
  const packageLockPath = path.join(root, "package-lock.json");
  const pyprojectPath = path.join(root, "python", "pyproject.toml");
  const pythonVersionPath = path.join(root, "python", "dbar", "_version.py");

  const packageJson = readJson(packageJsonPath);
  packageJson.version = release.npmVersion;
  writeJson(packageJsonPath, packageJson);

  const packageLock = readJson(packageLockPath);
  packageLock.version = release.npmVersion;
  if (!packageLock.packages?.[""]) {
    throw new Error("package-lock.json is missing packages[\"\"]");
  }
  packageLock.packages[""].version = release.npmVersion;
  writeJson(packageLockPath, packageLock);

  const pyproject = fs.readFileSync(pyprojectPath, "utf8");
  fs.writeFileSync(
    pyprojectPath,
    replaceVersionLine(
      pyproject,
      /^version = "([^"]+)"$/m,
      `version = "${release.pythonVersion}"`,
      pyprojectPath,
    ),
  );

  const pythonVersion = fs.readFileSync(pythonVersionPath, "utf8");
  fs.writeFileSync(
    pythonVersionPath,
    replaceVersionLine(
      pythonVersion,
      /^__version__ = "([^"]+)"$/m,
      `__version__ = "${release.pythonVersion}"`,
      pythonVersionPath,
    ),
  );
}

function assertVersions(root, release) {
  const versions = currentVersions(root);
  const expected = {
    npm: release.npmVersion,
    packageLock: release.npmVersion,
    packageLockRoot: release.npmVersion,
    python: release.pythonVersion,
    pythonRuntime: release.pythonVersion,
  };
  const mismatches = Object.entries(expected).filter(
    ([key, expectedValue]) => versions[key] !== expectedValue,
  );

  if (mismatches.length > 0) {
    throw new Error(
      mismatches
        .map(([key, expectedValue]) => {
          return `${key} version is ${versions[key] ?? "<missing>"}, expected ${expectedValue}`;
        })
        .join("\n"),
    );
  }
}

function writeGithubOutput(filePath, release) {
  const lines = [
    `release_tag=${release.tag}`,
    `stable_version=${release.stableVersion}`,
    `npm_version=${release.npmVersion}`,
    `python_version=${release.pythonVersion}`,
    `npm_dist_tag=${release.npmDistTag}`,
    `github_prerelease=${release.githubPrerelease ? "true" : "false"}`,
  ];
  fs.appendFileSync(filePath, `${lines.join("\n")}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const release = parseTag(options.tag);

  if (!options.check) {
    applyVersions(options.root, release);
  }
  assertVersions(options.root, release);

  if (options.githubOutput) {
    writeGithubOutput(options.githubOutput, release);
  }

  process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
