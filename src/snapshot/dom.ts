import { createHash } from "node:crypto";
import type { CDPSession } from "playwright-core";

/** Result of a DOM snapshot capture with a deterministic hash. */
export interface DOMSnapshotResult {
  snapshot: unknown;
  hash: string;
  serialized: string;
}

/**
 * Capture a DOM snapshot and produce a SHA-256 hash for determinism comparison.
 *
 * The hash is computed from the page's serialized HTML (`document.documentElement.outerHTML`)
 * which is structural and layout-independent — it won't vary due to rendering
 * differences (pixel positions, font metrics, paint order) between runs.
 *
 * A full CDP `DOMSnapshot.captureSnapshot` is also captured as the artifact
 * for debugging and analysis, but it is NOT used for the hash.
 *
 * @param cdpSession - Active CDP session to the target page
 * @returns Snapshot data, the serialized HTML, and SHA-256 hash
 */
export async function captureDOMSnapshot(
  cdpSession: CDPSession
): Promise<DOMSnapshotResult> {
  // Get the structural HTML via CDP DOM.getOuterHTML — this is deterministic
  // for identical page content (unlike DOMSnapshot.captureSnapshot which
  // includes computed styles and layout data that vary between runs).
  const { root } = (await cdpSession.send("DOM.getDocument" as any, {
    depth: 0,
  })) as { root: { nodeId: number } };

  const { outerHTML } = (await cdpSession.send("DOM.getOuterHTML" as any, {
    nodeId: root.nodeId,
  })) as { outerHTML: string };

  // The outerHTML is the canonical structural representation of the DOM.
  const serialized = outerHTML;
  const hash = createHash("sha256").update(serialized).digest("hex");

  // Also capture the full CDP snapshot as the artifact for debugging/analysis.
  await cdpSession.send("DOMSnapshot.enable" as any);
  const snapshot = await cdpSession.send(
    "DOMSnapshot.captureSnapshot" as any,
    {
      computedStyles: ["display", "visibility", "opacity", "position"],
      includePaintOrder: false,
      includeDOMRects: false,
    } as any
  );

  return { snapshot, hash, serialized };
}

