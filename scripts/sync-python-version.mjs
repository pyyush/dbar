import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const version = packageJson.version;
const pyprojectPath = resolve("python/pyproject.toml");
const pyproject = readFileSync(pyprojectPath, "utf8");
const nextPyproject = pyproject.replace(/^version = "[^"]+"$/m, `version = "${version}"`);

if (nextPyproject !== pyproject) {
  writeFileSync(pyprojectPath, nextPyproject, "utf8");
  console.log(`Synced python/pyproject.toml to ${version}`);
} else {
  console.log(`python/pyproject.toml already at ${version}`);
}
