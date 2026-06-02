import fs from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { extractAttachment, MAX_SIZE, type ExtractedAttachment } from "@/lib/attachments";
import { loadTemplate } from "@/lib/templates/registry";
import { ImageBank, type ImageBankEntry } from "@/lib/media/imageBank";
import {
  extractPptxEmbedded,
  extractDocxEmbedded,
  extractPdfEmbedded,
  extractSingleImage,
} from "@/lib/media/extractEmbedded";
import { applyImageBank } from "@/lib/media/applyImageBank";
import { buildSlideSystemPrompt } from "@/lib/prompt/buildSlideSystemPrompt";
import { streamSlides } from "@/lib/claude/streamSlides";
import { frame, comment } from "@/lib/sse/encoder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

let inflight = 0;
const MAX_INFLIGHT = 3;
const DESIGN_LIQUID_PATH = path.join(process.cwd(), "src/lib/prompt/design-liquid.md");

function tryAcquireSlot(): boolean {
  if (inflight >= MAX_INFLIGHT) return false;
  inflight += 1;
  return true;
}

function releaseSlot(): void {
  inflight = Math.max(0, inflight - 1);
}

function badRequest(message: string, code = "bad_request"): Response {
  return Response.json({ ok: false, code, message }, { status: 400 });
}

function buildUserContent(
  att: ExtractedAttachment,
  // instruction is delivered via system prompt (buildSlideSystemPrompt),
  // kept as parameter for symmetry/future use.
  _instruction: string,
): Anthropic.Messages.ContentBlockParam[] {
  const intro =
    `以下の資料（${att.filename}）からコンテンツを読み取り、` +
    `テンプレ規約に沿ったマルチスライド HTML を生成してください。`;

  switch (att.kind) {
    case "pdf":
      return [
        { type: "text", text: intro },
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: att.pdfBase64 },
        },
      ];
    case "image":
      return [
        {
          type: "text",
          text: intro + "\n（画像から文字・図表を読み取り、内容を構造化してください）",
        },
        {
          type: "image",
          source: { type: "base64", media_type: att.mediaType, data: att.base64 },
        },
      ];
    case "html":
      return [
        {
          type: "text",
          text:
            intro +
            "\n以下は参考用の HTML 文字列です。マークアップ構造は無視し、**テキスト内容だけを拾って**再構成してください。\n\n```html\n" +
            att.text +
            "\n```",
        },
      ];
    case "docx":
    case "pptx":
    case "text":
      return [
        {
          type: "text",
          text: intro + "\n以下が抽出されたテキストです。\n\n```\n" + att.text + "\n```",
        },
      ];
  }
}

export async function POST(req: Request): Promise<Response> {
  // Cheap pre-check to short-circuit obvious overload before doing any work.
  // Authoritative gate (tryAcquireSlot) happens after validation, just before
  // we open the stream — so that bad-request paths don't burn a slot.
  if (inflight >= MAX_INFLIGHT) {
    return Response.json(
      { ok: false, code: "busy", message: "現在他のリクエストを処理中です。少し時間を空けてください。" },
      { status: 503 },
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_SIZE + 1024 * 1024) {
    return badRequest("ファイルサイズが上限（25MB）を超えています", "size_limit");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("multipart/form-data として解釈できませんでした");
  }

  const file = form.get("file");
  const templateRaw = String(form.get("template") ?? "").trim();
  const slideCountHintRawValue = form.get("slideCountHint");
  const slideCountHintRaw =
    typeof slideCountHintRawValue === "string" ? slideCountHintRawValue.trim() : "";
  const instructionRaw = String(form.get("instruction") ?? "").trim();

  if (!templateRaw) {
    return badRequest("template フィールドが必要です", "bad_template");
  }

  let slideCountHint: number | "auto";
  if (slideCountHintRaw === "" || slideCountHintRaw === "auto") {
    slideCountHint = "auto";
  } else {
    const n = Number(slideCountHintRaw);
    if (!Number.isFinite(n) || n < 5 || n > 40) {
      return badRequest(
        "slideCountHint は 5〜40 の数値、または 'auto' を指定してください",
        "bad_slide_count",
      );
    }
    slideCountHint = Math.round(n);
  }

  if (!(file instanceof File)) {
    return badRequest("file フィールドが見つかりません");
  }
  if (file.size === 0) {
    return badRequest("空のファイルは扱えません");
  }
  if (file.size > MAX_SIZE) {
    return badRequest("ファイルサイズが上限（25MB）を超えています", "size_limit");
  }

  // Load template up-front so we can 400 before opening the stream.
  let template;
  try {
    template = await loadTemplate(templateRaw);
  } catch {
    return badRequest(`テンプレ「${templateRaw}」が見つかりません`, "bad_template");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  // Authoritative gate: atomically check + reserve. If we lose the race with
  // another request that arrived between the pre-check and here, return 503.
  if (!tryAcquireSlot()) {
    return Response.json(
      { ok: false, code: "busy", message: "現在他のリクエストを処理中です。少し時間を空けてください。" },
      { status: 503 },
    );
  }

  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    releaseSlot();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(comment("keepalive"));
        } catch {
          /* closed */
        }
      }, 15000);

      const cleanup = () => {
        clearInterval(heartbeat);
        releaseOnce();
      };

      try {
        // Phase 1: text extraction
        controller.enqueue(
          frame({
            event: "progress",
            data: { phase: "reading", detail: `${file.name} を読み取っています` },
          }),
        );

        const extracted = await extractAttachment({
          filename: file.name,
          mimeType,
          buffer,
        });

        // Phase 2: embedded image extraction
        controller.enqueue(
          frame({
            event: "progress",
            data: { phase: "extracting_images", detail: "埋め込み画像を抽出しています" },
          }),
        );

        const bank = new ImageBank();
        if (extracted.kind === "pdf") {
          try {
            await extractPdfEmbedded(buffer, bank);
          } catch {
            // ignore — PDF image extraction is best-effort
          }
          // Phase 1: PDF page capture is intentionally deferred.
          controller.enqueue(
            frame({
              event: "progress",
              data: {
                phase: "pdf_page_capture_skipped",
                detail: "PDF のページ画像化は未対応です（埋め込み画像のみ取り込みました）",
              },
            }),
          );
        } else if (extracted.kind === "pptx") {
          extractPptxEmbedded(buffer, bank);
        } else if (extracted.kind === "docx") {
          extractDocxEmbedded(buffer, bank);
        } else if (extracted.kind === "image") {
          extractSingleImage(buffer, mimeType, bank, file.name);
        }

        const bankEntries: ImageBankEntry[] = await bank.finalize();

        // Send shell up-front so the UI can boot a working preview before slides arrive.
        controller.enqueue(
          frame({
            event: "shell",
            data: { shellHead: template.shellHead, shellTail: template.shellTail },
          }),
        );

        // Read design-liquid.md
        let designMd = "";
        try {
          designMd = await fs.readFile(DESIGN_LIQUID_PATH, "utf8");
        } catch {
          designMd = "";
        }

        const systemBlocks = buildSlideSystemPrompt({
          template,
          designMd,
          imageBank: bankEntries,
          slideCountHint,
          userInstruction: instructionRaw || undefined,
        });

        const userContent = buildUserContent(extracted, instructionRaw);

        controller.enqueue(
          frame({
            event: "progress",
            data: { phase: "thinking", detail: "情報構造を組み立てています" },
          }),
        );

        let writingAnnounced = false;
        let slideCount = 0;

        for await (const evt of streamSlides({
          system: systemBlocks,
          userContent,
          abortSignal: req.signal,
        })) {
          if (evt.type === "slide_start") {
            if (!writingAnnounced) {
              writingAnnounced = true;
              controller.enqueue(
                frame({
                  event: "progress",
                  data: { phase: "writing", detail: "スライドを生成しています" },
                }),
              );
            }
            controller.enqueue(
              frame({
                event: "slide_start",
                data: { index: evt.index, slideType: evt.slideType },
              }),
            );
          } else if (evt.type === "slide_delta") {
            controller.enqueue(
              frame({
                event: "slide_delta",
                data: { index: evt.index, chunk: evt.chunk },
              }),
            );
          } else if (evt.type === "slide_done") {
            slideCount += 1;
            // Determine the slideType from the html if not tracked separately.
            // SlideSplitter doesn't echo slideType on slide_done; recover from class attr.
            const typeMatch = /class="slide\s+slide--([a-zA-Z0-9_-]+)/.exec(evt.html);
            const slideType = typeMatch ? typeMatch[1] : "unknown";
            const finalHtml = applyImageBank(evt.html, bankEntries);
            controller.enqueue(
              frame({
                event: "slide_done",
                data: { index: evt.index, slideType, html: finalHtml },
              }),
            );
          } else if (evt.type === "between") {
            // Stray text outside slide markers — keep it in server logs only.
            // Surfacing this to the UI as "(diagnostic)" progress was noisy
            // and confused users; the model also leaks reasoning preambles here.
            const trimmed = evt.chunk.trim();
            if (trimmed.length > 0) {
              console.warn(
                "[generate] between-marker text received:",
                trimmed.slice(0, 200),
              );
            }
          } else if (evt.type === "usage") {
            controller.enqueue(
              frame({
                event: "done",
                data: {
                  slideCount,
                  tokensIn: evt.input_tokens,
                  tokensOut: evt.output_tokens,
                  cacheRead: evt.cache_read_input_tokens,
                  finishReason: evt.stop_reason,
                  shellHead: template.shellHead,
                  shellTail: template.shellTail,
                },
              }),
            );
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const aborted = req.signal.aborted || /aborted/i.test(message);
        controller.enqueue(
          frame({
            event: "error",
            data: {
              code: aborted ? "aborted" : "upstream_error",
              message: aborted ? "クライアントによって中断されました" : message,
              retriable: !aborted,
            },
          }),
        );
      } finally {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      releaseOnce();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
