import "server-only";
import AdmZip from "adm-zip";
import type { ImageBank } from "./imageBank";

const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp)$/i;
// SVG inside PPTX/DOCX media is excluded — typically decorative icons that misfire as content

function extractFromZipMedia(buf: Buffer, mediaPrefix: string, bank: ImageBank): void {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    return;
  }
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (!name.startsWith(mediaPrefix)) continue;
    if (!IMAGE_EXT_RE.test(name)) continue;
    let data: Buffer;
    try {
      data = entry.getData();
    } catch {
      continue;
    }
    if (!data || data.length === 0) continue;
    const inferredMime = inferMimeFromExt(name);
    bank.addEmbedded(data, inferredMime, name.split("/").pop());
  }
}

function inferMimeFromExt(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export function extractPptxEmbedded(buf: Buffer, bank: ImageBank): void {
  extractFromZipMedia(buf, "ppt/media/", bank);
}

export function extractDocxEmbedded(buf: Buffer, bank: ImageBank): void {
  extractFromZipMedia(buf, "word/media/", bank);
}

/**
 * Extract embedded raster images from a PDF via pdfjs-dist's operator list.
 * Page-level captures (rendering the whole page to an image) are not supported here;
 * see renderPages.ts which currently stubs that.
 */
export async function extractPdfEmbedded(
  buf: Buffer,
  bank: ImageBank,
  opts?: { maxImages?: number },
): Promise<void> {
  const maxImages = opts?.maxImages ?? 60;

  // Dynamic import so Next.js doesn't try to bundle pdfjs for the edge runtime.
  // The legacy build is required for Node.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Disable worker — we're in Node and don't need a separate thread.
  if ((pdfjs as { GlobalWorkerOptions?: { workerSrc?: unknown } }).GlobalWorkerOptions) {
    (pdfjs as { GlobalWorkerOptions: { workerSrc?: unknown } }).GlobalWorkerOptions.workerSrc =
      false as unknown;
  }

  const uint8 = new Uint8Array(buf);
  const loadingTask = (
    pdfjs as unknown as {
      getDocument: (args: {
        data: Uint8Array;
        disableFontFace?: boolean;
        useSystemFonts?: boolean;
        isEvalSupported?: boolean;
      }) => { promise: Promise<unknown> };
    }
  ).getDocument({
    data: uint8,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });

  type PdfDoc = {
    numPages: number;
    getPage: (n: number) => Promise<PdfPage>;
    destroy: () => Promise<void> | void;
  };
  type PdfPage = {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get: (id: string) => unknown };
    commonObjs: { get: (id: string) => unknown };
  };

  let doc: PdfDoc | null = null;
  try {
    doc = (await loadingTask.promise) as PdfDoc;
  } catch {
    return;
  }
  if (!doc) return;

  const OPS = (pdfjs as unknown as { OPS: Record<string, number> }).OPS;
  const targetOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintJpegXObject,
  ].filter((v): v is number => typeof v === "number"));

  let collected = 0;

  pages: for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    if (collected >= maxImages) break;
    let page: PdfPage;
    try {
      page = await doc.getPage(pageNum);
    } catch {
      continue;
    }
    let ops: { fnArray: number[]; argsArray: unknown[][] };
    try {
      ops = await page.getOperatorList();
    } catch {
      continue;
    }
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i];
      if (!targetOps.has(fn)) continue;
      const args = ops.argsArray[i];
      const imgId = typeof args?.[0] === "string" ? (args[0] as string) : null;
      if (!imgId) continue;

      let imgRef: unknown = null;
      try {
        imgRef = page.objs.get(imgId);
      } catch {
        try {
          imgRef = page.commonObjs.get(imgId);
        } catch {
          imgRef = null;
        }
      }
      if (!imgRef) continue;

      const buffer = extractRawImageBuffer(imgRef);
      if (!buffer) continue;
      bank.addEmbedded(buffer, "image/png", `pdf-page-${pageNum}-${imgId}`);
      collected += 1;
      if (collected >= maxImages) break pages;
    }
  }

  try {
    await doc.destroy();
  } catch {
    // ignore
  }
}

/**
 * pdfjs gives us either a JPEG-encoded buffer, or a raw bitmap (Uint8ClampedArray / Uint8Array).
 * For raw bitmaps we wrap them in a PNG via sharp at the consumer side — here we attempt to
 * produce a PNG-ready Buffer when possible, or return the encoded buffer for JPEG.
 */
function extractRawImageBuffer(imgRef: unknown): Buffer | null {
  const obj = imgRef as {
    data?: Uint8Array | Uint8ClampedArray;
    width?: number;
    height?: number;
    kind?: number;
    bitmap?: unknown;
  } | null;
  if (!obj) return null;

  // JPEG / inline-encoded image: pdfjs sometimes exposes the raw encoded stream
  // under .data with kind===undefined and matching JPEG SOI marker.
  if (obj.data && obj.data.length >= 4) {
    const d = obj.data;
    // JPEG SOI (FF D8) — encoded JPEG, return as-is
    if (d[0] === 0xff && d[1] === 0xd8) {
      return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
    }
    // PNG signature
    if (
      d[0] === 0x89 &&
      d[1] === 0x50 &&
      d[2] === 0x4e &&
      d[3] === 0x47
    ) {
      return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
    }
  }

  // Raw bitmap path requires width/height/data and would need re-encoding through
  // sharp.raw() — for Phase 1 we skip raw bitmaps to avoid guessing channel layout.
  return null;
}

/**
 * Treat an arbitrary image buffer (when the user uploads a single image) as embedded.
 */
export function extractSingleImage(
  buf: Buffer,
  mime: string,
  bank: ImageBank,
  hint?: string,
): void {
  if (!buf || buf.length === 0) return;
  bank.addEmbedded(buf, mime, hint);
}
