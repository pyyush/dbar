import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  DBAR,
  deserializeCapsuleArchive,
  serializeCapsuleArchive,
} from "@pyyush/dbar";

const artifactsDir = new URL("./artifacts/", import.meta.url);
const capsulePath = new URL("./artifacts/example-homepage.capsule", import.meta.url);

await mkdir(artifactsDir, { recursive: true });

const browser = await chromium.launch();

try {
  const capturePage = await browser.newPage();
  const capture = await DBAR.capture(capturePage);

  await capturePage.goto("https://example.com", { waitUntil: "domcontentloaded" });
  await capture.step("example-homepage");

  const archive = await capture.finish();
  const validation = DBAR.validate(archive);

  if (!validation.valid) {
    throw new Error(
      `Capsule validation failed: ${validation.errors.map((error) => error.message).join("; ")}`
    );
  }

  await writeFile(capsulePath, serializeCapsuleArchive(archive), "utf8");

  const replayPage = await browser.newPage();
  const replayArchive = deserializeCapsuleArchive(await readFile(capsulePath, "utf8"));
  const replay = await DBAR.startReplay(replayPage, replayArchive);

  await replayPage.goto("https://example.com", { waitUntil: "domcontentloaded" });
  const firstStep = await replay.step();
  const result = await replay.finish();

  console.log(
    JSON.stringify(
      {
        capsule: capsulePath.pathname,
        validationWarnings: validation.warnings.length,
        firstStepMatched: firstStep.matched,
        success: result.success,
        replaySuccessRate: result.replaySuccessRate,
        timeToDivergence: result.timeToDivergence ?? null,
        divergenceCount: result.divergences.length,
      },
      null,
      2
    )
  );

  process.exitCode = result.success ? 0 : 1;
} finally {
  await browser.close();
}
