import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const packageName = packageJson.name;
const version = packageJson.version;

function isAlreadyPublished(name, currentVersion) {
  try {
    const result = execFileSync(
      "npm",
      ["view", `${name}@${currentVersion}`, "version"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return result === currentVersion;
  } catch {
    return false;
  }
}

if (isAlreadyPublished(packageName, version)) {
  console.log(`${packageName}@${version} is already published. Skipping npm publish.`);
  process.exit(0);
}

execFileSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: process.env,
});

execFileSync("npx", ["changeset", "publish"], {
  stdio: "inherit",
  env: process.env,
});
