import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";

const artifactsDir = new URL("./artifacts/", import.meta.url);
const capsulePath = new URL("./artifacts/two-step-navigation.capsule", import.meta.url);

await mkdir(artifactsDir, { recursive: true });

const browser = await chromium.launch();

try {
  const capturePage = await browser.newPage();
  const capture = await DBAR.capture(capturePage);

  await capturePage.goto("https://example.com", { waitUntil: "domcontentloaded" });
  await capture.step("example-homepage");

  await capturePage.click("a");
  await capturePage.waitForLoadState("domcontentloaded");
  await capture.step("after-link-click");

  const archive = await capture.finish();
  await writeFile(capsulePath, serializeCapsuleArchive(archive), "utf8");

  const replayPage = await browser.newPage();
  const replay = await DBAR.startReplay(replayPage, archive);

  await replayPage.goto("https://example.com", { waitUntil: "domcontentloaded" });
  const first = await replay.step();

  await replayPage.click("a");
  await replayPage.waitForLoadState("domcontentloaded");
  const second = await replay.step();

  const result = await replay.finish();

  console.log(
    JSON.stringify(
      {
        capsule: capsulePath.pathname,
        stepMatches: [first.matched, second.matched],
        success: result.success,
        replaySuccessRate: result.replaySuccessRate,
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
