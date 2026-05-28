"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { SlideCountInput } from "@/components/SlideCountInput";
import { PreviewIframe } from "@/components/PreviewIframe";
import { ActionBar } from "@/components/ActionBar";
import { ProgressLine, type Phase } from "@/components/ProgressLine";
import { PublishPanel } from "@/components/PublishPanel";

type DoneMeta = {
  slideCount?: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  finishReason: string;
};

type SlideState = {
  index: number;
  slideType: string;
  html: string;
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DEFAULT_TEMPLATE = "presentation-liquid";
const DEFAULT_SLIDE_COUNT = 12;

function deriveDownloadName(srcName: string | undefined): string {
  if (!srcName) return "slides.html";
  const base = srcName.replace(/\.[^.]+$/, "");
  return `${base || "slides"}.html`;
}

function sanitizeHtml(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function assembleHtml(shellHead: string, slides: SlideState[], shellTail: string): string {
  const slideBody = slides
    .filter((s): s is SlideState => Boolean(s))
    .sort((a, b) => a.index - b.index)
    .map((s) => s.html)
    .join("\n");
  if (!shellHead && !shellTail) {
    // Lightweight fallback preview before <shell> arrives.
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${slideBody}</body></html>`;
  }
  return `${shellHead}${slideBody}${shellTail}`;
}

type SseHandlers = {
  onProgress: (phase: Phase, detail: string) => void;
  onShell: (shellHead: string, shellTail: string) => void;
  onSlideStart: (index: number, slideType: string) => void;
  onSlideDelta: (index: number, chunk: string) => void;
  onSlideDone: (index: number, slideType: string, html: string) => void;
  onDone: (meta: DoneMeta & { shellHead?: string; shellTail?: string }) => void;
  onError: (message: string) => void;
};

async function consumeSse(res: Response, handlers: SseHandlers) {
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `失敗しました (HTTP ${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n\n");
    while (idx !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      idx = buf.indexOf("\n\n");

      const lines = chunk.split("\n");
      let ev = "";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!ev) continue;

      try {
        const data = dataLine ? JSON.parse(dataLine) : {};
        if (ev === "progress") {
          handlers.onProgress(data.phase, data.detail ?? "");
        } else if (ev === "shell") {
          handlers.onShell(data.shellHead ?? "", data.shellTail ?? "");
        } else if (ev === "slide_start") {
          handlers.onSlideStart(Number(data.index), String(data.slideType ?? "unknown"));
        } else if (ev === "slide_delta") {
          handlers.onSlideDelta(Number(data.index), String(data.chunk ?? ""));
        } else if (ev === "slide_done") {
          handlers.onSlideDone(
            Number(data.index),
            String(data.slideType ?? "unknown"),
            String(data.html ?? ""),
          );
        } else if (ev === "done") {
          handlers.onDone({
            slideCount: data.slideCount,
            tokensIn: data.tokensIn,
            tokensOut: data.tokensOut,
            cacheRead: data.cacheRead ?? 0,
            finishReason: data.finishReason,
            shellHead: data.shellHead,
            shellTail: data.shellTail,
          });
        } else if (ev === "error") {
          handlers.onError(data.message ?? "エラーが発生しました");
        }
      } catch {
        /* malformed chunk, ignore */
      }
    }
  }
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const template = DEFAULT_TEMPLATE;
  const [slideCount, setSlideCount] = useState<number>(DEFAULT_SLIDE_COUNT);
  const [instruction, setInstruction] = useState<string>("");
  const [slides, setSlides] = useState<SlideState[]>([]);
  const [shellHead, setShellHead] = useState<string>("");
  const [shellTail, setShellTail] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isStreaming =
    phase === "reading" ||
    phase === "extracting_images" ||
    phase === "thinking" ||
    phase === "writing";

  const upsertSlide = useCallback((next: SlideState) => {
    setSlides((prev) => {
      const out = prev.slice();
      const i = out.findIndex((s) => s.index === next.index);
      if (i === -1) out.push(next);
      else out[i] = next;
      return out;
    });
  }, []);

  const appendToSlide = useCallback((index: number, chunk: string) => {
    setSlides((prev) => {
      const out = prev.slice();
      const i = out.findIndex((s) => s.index === index);
      if (i === -1) {
        out.push({ index, slideType: "unknown", html: chunk });
      } else {
        out[i] = { ...out[i], html: out[i].html + chunk };
      }
      return out;
    });
  }, []);

  const generate = useCallback(async () => {
    if (!file) return;

    setError(null);
    setDone(null);
    setSlides([]);
    setShellHead("");
    setShellTail("");
    setPhase("reading");
    setDetail("");

    const controller = new AbortController();
    abortRef.current = controller;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("template", template);
    fd.append("slideCountHint", String(slideCount));
    if (instruction.trim()) fd.append("instruction", instruction.trim());

    try {
      const res = await fetch(`${BASE_PATH}/api/generate`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      await consumeSse(res, {
        onProgress: (p, d) => {
          setPhase(p);
          setDetail(d);
        },
        onShell: (head, tail) => {
          setShellHead(head);
          setShellTail(tail);
        },
        onSlideStart: (index, slideType) => {
          upsertSlide({ index, slideType, html: "" });
        },
        onSlideDelta: (index, chunk) => {
          appendToSlide(index, chunk);
        },
        onSlideDone: (index, slideType, html) => {
          upsertSlide({ index, slideType, html });
        },
        onDone: (meta) => {
          if (meta.shellHead) setShellHead(meta.shellHead);
          if (meta.shellTail) setShellTail(meta.shellTail);
          const truncated = meta.finishReason === "max_tokens";
          setPhase(truncated ? "truncated" : "done");
          setDetail(
            truncated
              ? "max_tokens に達しました。「やり直す」で再生成してください。"
              : `${meta.slideCount ?? 0} スライドを生成しました`,
          );
          setDone({
            slideCount: meta.slideCount,
            tokensIn: meta.tokensIn,
            tokensOut: meta.tokensOut,
            cacheRead: meta.cacheRead,
            finishReason: meta.finishReason,
          });
        },
        onError: (msg) => {
          setPhase("error");
          setError(msg);
        },
      });
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setPhase("error");
      setError((err as Error).message ?? "失敗しました");
    }
  }, [file, template, slideCount, instruction, appendToSlide, upsertSlide]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setDetail("");
  }, []);

  const assembled = useMemo(
    () => assembleHtml(shellHead, slides, shellTail),
    [shellHead, slides, shellTail],
  );
  const cleaned = useMemo(() => sanitizeHtml(assembled), [assembled]);
  const hasOutput = slides.length > 0;

  return (
    <>
      <header className="header">
        <div className="header__brand">
          <span className="header__lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="header__logo"
              src="https://app.instyle.group/_shared/static/logo.svg"
              alt="instyle group"
            />
            <h1 className="header__title">Slide Maker</h1>
          </span>
          <span className="header__tag">BETA</span>
        </div>
      </header>

      <main className="main">
        <section className="controls">
          <div className="controls__inner">
            <div>
              <h2 className="controls__section-title">1. 資料を入れる</h2>
              <DropZone file={file} onFile={setFile} disabled={isStreaming} />
            </div>

            <div>
              <h2 className="controls__section-title">2. スライド数の目安</h2>
              <SlideCountInput
                value={slideCount}
                onChange={setSlideCount}
                disabled={isStreaming}
              />
            </div>

            <div>
              <h2 className="controls__section-title">3. 追加指示（任意）</h2>
              <textarea
                className="instruction-textarea"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={isStreaming}
                placeholder="例：表紙の社名は『株式会社サンプル』にしてください。"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "rgba(255,255,255,0.6)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div>
              {isStreaming ? (
                <button type="button" className="btn-primary" onClick={cancel}>
                  中断する
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!file || !template}
                  onClick={generate}
                >
                  スライドを作る
                </button>
              )}
            </div>

            {phase !== "idle" && (
              <ProgressLine
                phase={phase}
                detail={detail}
                tokensIn={done?.tokensIn}
                tokensOut={done?.tokensOut}
                cacheRead={done?.cacheRead}
              />
            )}

            {error && <div className="toast">{error}</div>}

            {hasOutput && (
              <div>
                <h2 className="controls__section-title">4. 公開する</h2>
                <PublishPanel html={cleaned} disabled={isStreaming} basePath={BASE_PATH} />
              </div>
            )}
          </div>
        </section>

        <section className="preview">
          <div className="preview__header">
            <h2 className="preview__title">プレビュー</h2>
            <ActionBar
              html={cleaned}
              filename={deriveDownloadName(file?.name)}
              onRegenerate={generate}
              disabled={isStreaming || !file}
            />
          </div>
          <PreviewIframe html={cleaned} empty={!hasOutput} />
        </section>
      </main>

      <footer className="footer">instyle group · ig-slidemaker</footer>
    </>
  );
}
