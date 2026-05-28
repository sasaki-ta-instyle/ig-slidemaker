import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";

export type ImageSourceType = "embedded" | "page";

export interface ImageBankEntry {
  id: string;
  width: number;
  height: number;
  mime: "image/webp";
  bytes: number;
  dataUrl?: string;
  sourceType: ImageSourceType;
  sourcePage?: number;
  sha256: string;
  contentDescription?: string;
}

interface PendingEntry {
  id: string;
  buffer: Buffer;
  sourceType: ImageSourceType;
  sourcePage?: number;
  contentDescription?: string;
}

const MAX_LONG_EDGE = 1600;
const PER_IMAGE_INLINE_LIMIT = 200 * 1024; // 200KB
const TOTAL_BANK_INLINE_LIMIT = 6 * 1024 * 1024; // 6MB

export class ImageBank {
  private pending: PendingEntry[] = [];
  private nextIndex = 1;

  private allocateId(): string {
    const id = `img-${String(this.nextIndex).padStart(3, "0")}`;
    this.nextIndex += 1;
    return id;
  }

  addEmbedded(buf: Buffer, _mime: string, hint?: string): string {
    const id = this.allocateId();
    this.pending.push({
      id,
      buffer: buf,
      sourceType: "embedded",
      contentDescription: hint,
    });
    return id;
  }

  addPageCapture(buf: Buffer, page: number, hint?: string): string {
    const id = this.allocateId();
    this.pending.push({
      id,
      buffer: buf,
      sourceType: "page",
      sourcePage: page,
      contentDescription: hint ?? `page ${page} capture`,
    });
    return id;
  }

  async finalize(): Promise<ImageBankEntry[]> {
    const entries: ImageBankEntry[] = [];

    for (const item of this.pending) {
      let img: sharp.Sharp;
      try {
        img = sharp(item.buffer, { failOn: "none" });
      } catch {
        // skip undecodable buffer
        continue;
      }

      let metadata: sharp.Metadata;
      try {
        metadata = await img.metadata();
      } catch {
        continue;
      }

      const srcWidth = metadata.width ?? 0;
      const srcHeight = metadata.height ?? 0;
      if (!srcWidth || !srcHeight) continue;

      const longEdge = Math.max(srcWidth, srcHeight);
      const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
      const targetW = Math.max(1, Math.round(srcWidth * scale));
      const targetH = Math.max(1, Math.round(srcHeight * scale));

      let webpBuf: Buffer;
      try {
        webpBuf = await sharp(item.buffer, { failOn: "none" })
          .resize(targetW, targetH, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      } catch {
        continue;
      }

      const sha256 = crypto.createHash("sha256").update(webpBuf).digest("hex");

      entries.push({
        id: item.id,
        width: targetW,
        height: targetH,
        mime: "image/webp",
        bytes: webpBuf.length,
        dataUrl: `data:image/webp;base64,${webpBuf.toString("base64")}`,
        sourceType: item.sourceType,
        sourcePage: item.sourcePage,
        sha256,
        contentDescription: item.contentDescription,
      });
    }

    // Inline budget check: drop dataUrl on entries that don't fit
    const totalInline = entries.reduce((acc, e) => acc + (e.dataUrl ? e.bytes : 0), 0);
    if (totalInline > TOTAL_BANK_INLINE_LIMIT) {
      // Strip all data URLs — fall back to external mode for the whole bank
      for (const e of entries) {
        e.dataUrl = undefined;
      }
    } else {
      for (const e of entries) {
        if (e.bytes > PER_IMAGE_INLINE_LIMIT) {
          e.dataUrl = undefined;
        }
      }
    }

    this.pending = [];
    return entries;
  }
}
