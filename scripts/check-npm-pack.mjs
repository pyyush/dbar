import { spawnSync } from "node:child_process";
import process from "node:process";

const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
});

if (pack.status !== 0) {
  process.stderr.write(pack.stderr);
  process.stderr.write(pack.stdout);
  process.exit(pack.status ?? 1);
}

let packageInfo;
try {
  [packageInfo] = JSON.parse(pack.stdout);
} catch (error) {
  process.stderr.write(pack.stdout);
  process.stderr.write(`\nFailed to parse npm pack output: ${error}\n`);
  process.exit(1);
}

const files = packageInfo.files.map((file) => file.path).sort();
const required = [
  "LICENSE",
  "README.md",
  "dist/cli.d.ts",
  "dist/cli.js",
  "dist/index.cjs",
  "dist/index.d.cts",
  "dist/index.d.ts",
  "dist/index.js",
  "package.json",
];
const forbiddenPrefixes = [
  ".github/",
  ".omx/",
  ".pilot/",
  ".dev-session/",
  "demo/",
  "docs/",
  "examples/",
  "integrations/",
  "python/",
  "src/",
];
const forbiddenExact = new Set([
  "AGENTS.md",
  "AUDIT.md",
  "BROWSER_USE_PR.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "CODEOWNERS",
  "CONTRIBUTING.md",
  "MIGRATION.md",
  "POSITIONING.md",
  "RELEASE_PLAN.md",
  "ROADMAP.md",
  "SECURITY.md",
  "TROUBLESHOOTING.md",
]);

const missing = required.filter((path) => !files.includes(path));
const forbidden = files.filter((path) => {
  if (forbiddenExact.has(path)) {
    return true;
  }
  return forbiddenPrefixes.some((prefix) => path.startsWith(prefix));
});

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) {
    process.stderr.write(`Missing npm package files:\n${missing.join("\n")}\n`);
  }
  if (forbidden.length > 0) {
    process.stderr.write(`Forbidden npm package files:\n${forbidden.join("\n")}\n`);
  }
  process.exit(1);
}

console.log(
  `npm package verified: ${files.length} files, ${packageInfo.size} bytes packed, ${packageInfo.unpackedSize} bytes unpacked`,
);
