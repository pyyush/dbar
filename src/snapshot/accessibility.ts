import { createHash } from "node:crypto";
import type { Page, CDPSession } from "playwright-core";

/** Result of an accessibility tree snapshot with a deterministic hash. */
export interface AccessibilitySnapshotResult {
  tree: unknown;
  hash: string;
  serialized: string;
}

/**
 * Capture the page's accessibility tree and produce a SHA-256 hash of the
 * canonicalized JSON for determinism comparison.
 *
 * Tries three strategies in order:
 * 1. Playwright's `page.accessibility.snapshot()` (removed in Playwright >= 1.49)
 * 2. CDP `Accessibility.getFullAXTree` via an active CDP session
 * 3. Playwright's `page.locator("body").ariaSnapshot()` as a last resort
 *
 * @param page - Playwright Page instance
 * @param cdpSession - Optional CDP session for the CDP fallback
 * @returns The accessibility tree, its canonical JSON string, and SHA-256 hash
 */
export async function captureAccessibilitySnapshot(
  page: Page,
  cdpSession?: CDPSession
): Promise<AccessibilitySnapshotResult> {
  let tree: unknown;
  let hashSource: unknown;

  // Strategy 1: legacy Playwright API (available in Playwright < 1.49)
  const legacyA11y = (page as any).accessibility;
  if (legacyA11y && typeof legacyA11y.snapshot === "function") {
    try {
      tree = await legacyA11y.snapshot({ interestingOnly: false });
      hashSource = tree;
    } catch {
      // Might exist but throw at runtime — fall through
    }
  }

  // Strategy 2: CDP Accessibility.getFullAXTree — extract structural fields only
  if (tree == null && cdpSession) {
    try {
      const result = await cdpSession.send("Accessibility.getFullAXTree" as any);
      const nodes = (result as any).nodes as any[];
      tree = nodes;
      // Strip non-deterministic fields (nodeId, backendDOMNodeId, frameId,
      // parentId, childIds, chromeRole) — keep only structural content
      hashSource = nodes.map((n: any) => ({
        role: n.role?.value,
        name: n.name?.value,
        value: n.value?.value,
        description: n.description?.value,
        properties: (n.properties as any[] | undefined)
          ?.filter((p: any) => !NON_DETERMINISTIC_AX_PROPS.has(p.name))
          ?.map((p: any) => ({ name: p.name, value: p.value?.value })),
      }));
    } catch {
      // CDP method might not be available — fall through
    }
  }

  // Strategy 3: Playwright ariaSnapshot (string-based, wrap in object for hashing)
  if (tree == null) {
    try {
      const ariaText: string = await page.locator("body").ariaSnapshot();
      tree = {
        role: "WebArea",
        name: await page.title(),
        ariaSnapshot: ariaText,
      };
      hashSource = tree;
    } catch {
      tree = { role: "WebArea", name: "page", children: [] };
      hashSource = tree;
    }
  }

  const serialized = canonicalizeTree(hashSource);
  const hash = createHash("sha256").update(serialized).digest("hex");

  return { tree, hash, serialized };
}

/** AX node properties that vary between runs and should be excluded from hash. */
const NON_DETERMINISTIC_AX_PROPS = new Set([
  "focused",
  "focusable",
  "settable",
  "editable",
  "live",
  "atomic",
  "relevant",
  "busy",
  "root",
]);

/**
 * Sort object keys recursively for deterministic JSON serialization.
 * Arrays preserve their element order; only object key order is normalized.
 */
function canonicalizeTree(node: unknown): string {
  return JSON.stringify(node, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}
