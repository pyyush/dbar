import { createHash } from "node:crypto";

import { buildCapsule, serializeCapsuleArchive, type CapsuleBuildInput } from "../../capsule/builder.js";
import type { CapsuleStep, EnvironmentDescriptor, InitialState, SeedPackage } from "../../capsule/types.js";
import type { MutableNetworkEntry } from "../../network/types.js";

const environment: EnvironmentDescriptor = {
  browserBuild: "chromium/1240",
  browserFlags: ["--disable-background-networking", "--disable-extensions"],
  locale: "en-US",
  timezone: "UTC",
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  userAgent: "Mozilla/5.0 DBAR performance fixture",
  offline: false,
};

const seeds: SeedPackage = {
  initialTime: 1_700_000_000_000,
  orderingSeed: "task-12-fixture",
};

const initialState: InitialState = {
  url: "https://shop.example.test/dashboard?fixture=task12",
  cookies: [],
  localStorage: [],
  unsupportedState: ["sessionStorage", "indexedDB", "serviceWorkers"],
};

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function responseEntry(index: number, path: string, body: string): MutableNetworkEntry {
  const bodyBuffer = Buffer.from(body, "utf8");
  return {
    index,
    requestId: `req-${index}`,
    url: `https://shop.example.test${path}`,
    method: "GET",
    headers: { accept: "application/json" },
    requestHash: sha256(`GET:${path}`),
    occurrenceIndex: 0,
    timestamp: 1_700_000_000_000 + index,
    response: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: bodyBuffer.toString("base64"),
      bodyHash: sha256(bodyBuffer),
    },
  };
}

function step(index: number, label: string, actionType: string): CapsuleStep {
  return {
    index,
    label,
    action: { type: actionType, selector: `[data-step="${index}"]` },
    observables: {
      domSnapshotHash: sha256(`dom-${index}`),
      accessibilityHash: sha256(`a11y-${index}`),
      screenshotHash: sha256(`screenshot-${index}`),
      networkDigest: sha256(`network-${index}`),
    },
    artifacts: {
      domSnapshot: `snapshots/${index}/dom.json`,
      accessibilityYaml: `snapshots/${index}/accessibility.json`,
      screenshot: `snapshots/${index}/screenshot.png`,
      traceSegment: `traces/${index}.json`,
    },
  };
}

function domSnapshot(index: number): string {
  return JSON.stringify(
    {
      node: "main",
      route: "/dashboard",
      children: Array.from({ length: 80 }, (_, i) => ({
        tag: i % 3 === 0 ? "button" : "div",
        text: `Order ${index}-${i}`,
        attrs: { "data-row": String(i), "aria-label": `Order row ${i}` },
      })),
    },
    null,
    2
  );
}

function accessibilityYaml(index: number): string {
  return [
    "role: WebArea",
    "name: Shop dashboard",
    "children:",
    ...Array.from({ length: 40 }, (_, i) => `  - role: button\n    name: Action ${index}-${i}`),
  ].join("\n");
}

function screenshot(index: number): Buffer {
  return Buffer.alloc(18_000 + index * 512, index + 1);
}

export function createPerformanceFixture(): CapsuleBuildInput {
  const steps = [
    step(0, "dashboard-loaded", "navigate"),
    step(1, "filter-opened", "click"),
    step(2, "row-selected", "click"),
    step(3, "details-confirmed", "click"),
  ];

  const artifacts: CapsuleBuildInput["artifacts"] = new Map();
  for (const item of steps) {
    artifacts.set(item.index, {
      domSnapshot: domSnapshot(item.index),
      accessibilityYaml: accessibilityYaml(item.index),
      screenshot: screenshot(item.index),
      traceSegment: JSON.stringify({ step: item.index, events: Array.from({ length: 20 }, (_, i) => ({ i })) }),
    });
  }

  return {
    environment,
    seeds,
    initialState,
    networkTranscript: {
      orderingPolicy: "recorded",
      entries: [
        responseEntry(0, "/api/orders", JSON.stringify({ rows: Array.from({ length: 50 }, (_, i) => ({ id: i })) })),
        responseEntry(1, "/api/filter", JSON.stringify({ filters: ["open", "flagged", "mine"] })),
        responseEntry(2, "/api/orders/42", JSON.stringify({ id: 42, total: 199.95, status: "open" })),
        responseEntry(3, "/api/orders/42/confirm", JSON.stringify({ ok: true, id: 42 })),
      ],
    },
    steps,
    artifacts,
    captureStartTime: Date.now() - 240,
  };
}

export function buildPerformanceFixtureArchive() {
  const startedHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  const archive = buildCapsule(createPerformanceFixture());
  const buildMs = performance.now() - started;
  const serialized = serializeCapsuleArchive(archive);
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - startedHeap);

  return {
    archive,
    serialized,
    buildMs,
    heapDeltaBytes,
    capsuleSizeBytes: Buffer.byteLength(serialized, "utf8"),
    captureOverheadPerStepMs: archive.manifest.metrics.captureOverheadMs / archive.manifest.steps.length,
  };
}
