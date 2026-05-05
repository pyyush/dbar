import process from "node:process";

function parseArgs(argv) {
  const options = {
    npmPackage: undefined,
    npmRegistryUrl: "https://registry.npmjs.org",
    npmVersion: undefined,
    pypiJsonUrl: undefined,
    pypiPackage: undefined,
    pythonVersion: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === "--npm-package") {
      options.npmPackage = value;
    } else if (arg === "--npm-registry-url") {
      options.npmRegistryUrl = value;
    } else if (arg === "--npm-version") {
      options.npmVersion = value;
    } else if (arg === "--pypi-json-url") {
      options.pypiJsonUrl = value;
    } else if (arg === "--pypi-package") {
      options.pypiPackage = value;
    } else if (arg === "--python-version") {
      options.pythonVersion = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
    index += 1;
  }

  for (const key of ["npmPackage", "npmVersion", "pypiPackage", "pythonVersion"]) {
    if (options[key] === undefined) {
      throw new Error(`Missing required release registry option: ${key}`);
    }
  }

  return options;
}

function joinUrl(baseUrl, pathSegment) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(pathSegment, base).toString();
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "dbar-release-preflight",
    },
  });

  if (response.status === 404) {
    return { exists: false, json: undefined };
  }

  if (!response.ok) {
    throw new Error(`${label} registry returned HTTP ${response.status} for ${url}`);
  }

  return { exists: true, json: await response.json() };
}

function versionExists(versionMap, version) {
  return Boolean(
    versionMap &&
      typeof versionMap === "object" &&
      !Array.isArray(versionMap) &&
      Object.prototype.hasOwnProperty.call(versionMap, version),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const npmUrl = joinUrl(options.npmRegistryUrl, encodeURIComponent(options.npmPackage));
  const pypiUrl =
    options.pypiJsonUrl ?? `https://pypi.org/pypi/${encodeURIComponent(options.pypiPackage)}/json`;

  const npm = await fetchJson(npmUrl, "npm");
  if (!npm.exists) {
    process.stdout.write(`npm package ${options.npmPackage} does not exist yet.\n`);
  } else if (versionExists(npm.json?.versions, options.npmVersion)) {
    throw new Error(`${options.npmPackage}@${options.npmVersion} already exists on npm.`);
  } else {
    process.stdout.write(
      `npm package ${options.npmPackage} exists and ${options.npmVersion} is unpublished.\n`,
    );
  }

  const pypi = await fetchJson(pypiUrl, "PyPI");
  if (!pypi.exists) {
    process.stdout.write(
      `PyPI project ${options.pypiPackage} does not exist yet; trusted publishing must create it before npm or GitHub releases run.\n`,
    );
  } else if (versionExists(pypi.json?.releases, options.pythonVersion)) {
    throw new Error(`${options.pypiPackage}==${options.pythonVersion} already exists on PyPI.`);
  } else {
    process.stdout.write(
      `PyPI project ${options.pypiPackage} exists and ${options.pythonVersion} is unpublished.\n`,
    );
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
