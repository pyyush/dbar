import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";

const artifactsDir = new URL("./artifacts/", import.meta.url);
const capsulePath = new URL("./artifacts/failure-or-high-value.capsule", import.meta.url);

async function withFailureCapsule(page, run) {
  const capture = await DBAR.capture(page);
  let failed = false;

  try {
    await run(capture);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const archive = await capture.finish();
    const keepHighValueRun = process.env.DBAR_KEEP_HIGH_VALUE === "1";

    if (failed || keepHighValueRun) {
      await mkdir(artifactsDir, { recursive: true });
      await writeFile(capsulePath, serializeCapsuleArchive(archive), "utf8");
      console.error(`DBAR capsule written to ${capsulePath.pathname}`);
    }
  }
}

const browser = await chromium.launch();

try {
  const page = await browser.newPage();

  await withFailureCapsule(page, async (capture) => {
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    await capture.step("example-homepage");

    if (process.env.DBAR_DEMO_FAIL === "1") {
      throw new Error("Simulated workflow failure after DBAR capture");
    }
  });

  console.log("Workflow passed. Set DBAR_KEEP_HIGH_VALUE=1 to retain the capsule.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
