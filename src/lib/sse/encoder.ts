const enc = new TextEncoder();

export type ProgressPhase =
  | "reading"
  | "extracting_images"
  | "pdf_page_capture_skipped"
  | "thinking"
  | "writing"
  | "done"
  | string;

export type SSEEvent =
  | { event: "progress"; data: { phase: ProgressPhase; detail?: string } }
  | { event: "shell"; data: { shellHead: string; shellTail: string } }
  | { event: "slide_start"; data: { index: number; slideType: string } }
  | { event: "slide_delta"; data: { index: number; chunk: string } }
  | { event: "slide_done"; data: { index: number; slideType: string; html: string } }
  | { event: "html_delta"; data: { chunk: string } }
  | {
      event: "done";
      data: {
        slideCount?: number;
        htmlLength?: number;
        tokensIn: number;
        tokensOut: number;
        cacheRead?: number;
        finishReason: string;
        shellHead?: string;
        shellTail?: string;
      };
    }
  | { event: "error"; data: { code: string; message: string; retriable?: boolean } };

export function frame(ev: SSEEvent): Uint8Array {
  const lines = `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
  return enc.encode(lines);
}

export function comment(text: string): Uint8Array {
  return enc.encode(`: ${text}\n\n`);
}
