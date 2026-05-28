import "server-only";
import type { ImageBankEntry } from "./imageBank";

const IMG_TAG_RE = /<img\b([^>]*?)\bdata-bank-id\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)\/?>/gi;

const PLACEHOLDER_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="100%" height="100%" fill="#EDE9E0"/><g fill="#82837A" font-family="monospace" font-size="11" text-anchor="middle"><text x="160" y="100">IMAGE</text><text x="160" y="118" font-size="9">loading…</text></g></svg>`,
  "utf8",
).toString("base64");
const PLACEHOLDER_DATA_URL = `data:image/svg+xml;base64,${PLACEHOLDER_SVG}`;

function buildSrc(entry: ImageBankEntry, externalUrlPrefix?: string): string {
  if (entry.dataUrl) return entry.dataUrl;
  if (externalUrlPrefix) {
    const trimmed = externalUrlPrefix.replace(/\/$/, "");
    return `${trimmed}/${entry.sha256}.webp`;
  }
  return PLACEHOLDER_DATA_URL;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

export function applyImageBank(
  html: string,
  bank: ImageBankEntry[],
  opts: { externalUrlPrefix?: string } = {},
): string {
  const byId = new Map<string, ImageBankEntry>();
  for (const e of bank) byId.set(e.id, e);

  return html.replace(IMG_TAG_RE, (full, before: string, dq: string, sq: string, after: string) => {
    const id = (dq ?? sq ?? "").trim();
    const entry = byId.get(id);
    if (!entry) {
      // Bank does not contain this id — drop the tag entirely.
      return "";
    }
    const src = buildSrc(entry, opts.externalUrlPrefix);
    const combined = `${before ?? ""}${after ?? ""}`.trim();
    // Remove any existing src="..." that the model might have written despite our contract.
    const stripped = combined.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i, "").trim();
    const attrs = stripped.length > 0 ? ` ${stripped}` : "";
    return `<img src="${escapeAttr(src)}" data-bank-id="${escapeAttr(id)}"${attrs}>`;
  });
}
