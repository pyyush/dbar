import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    defaultBranch: "origin/main",
    root: process.cwd(),
    tag: process.env.GITHUB_REF_NAME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--default-branch") {
      const value = argv[index + 1];
      if (!value) throw new Error("--default-branch requires a git ref");
      options.defaultBranch = value;
      index += 1;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a path");
      options.root = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--tag") {
      const value = argv[index + 1];
      if (!value) throw new Error("--tag requires a release tag");
      options.tag = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.tag) {
    throw new Error("Release tag missing. Pass --tag or set GITHUB_REF_NAME.");
  }
  if (!/^v/.test(options.tag)) {
    throw new Error(`Release tag ${options.tag} is not a v* tag.`);
  }

  return options;
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const tagCommit = git(options.root, ["rev-parse", "--verify", `${options.tag}^{commit}`]);
  const defaultBranchCommit = git(options.root, [
    "rev-parse",
    "--verify",
    `${options.defaultBranch}^{commit}`,
  ]);

  try {
    git(options.root, ["merge-base", "--is-ancestor", tagCommit, defaultBranchCommit]);
  } catch {
    throw new Error(
      `Release tag ${options.tag} points to ${tagCommit}, which is not reachable from ${options.defaultBranch}. Move the tag to a commit merged into the default branch before publishing.`,
    );
  }

  process.stdout.write(
    `Release tag ${options.tag} points to ${tagCommit} reachable from ${options.defaultBranch} (${defaultBranchCommit}).\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
