import "server-only";
import type { ImageBank } from "./imageBank";

/**
 * Render each PDF page to an image and feed it into the bank as a "page capture".
 *
 * Phase 1: NOT IMPLEMENTED.
 *
 * Rendering pdfjs page output requires either a real DOM canvas (browser) or a Node
 * canvas binding (e.g. `@napi-rs/canvas` or `canvas`). We intentionally do not pull
 * those in for the MVP — installing a binary canvas dep on the ConoHa VPS adds
 * platform-specific risk that we'd rather defer.
 *
 * The MVP relies on `extractPdfEmbedded` (operator-list-based) for PDF image content.
 * Callers should advertise "pdf_page_capture: skipped" in their progress events.
 */
export async function renderPdfPages(
  _buf: Buffer,
  _bank: ImageBank,
  _options?: { maxPages?: number; scale?: number },
): Promise<void> {
  throw new Error(
    "not implemented: PDF page capture requires a headless browser or Node canvas binding (deferred to Phase 2)",
  );
}
