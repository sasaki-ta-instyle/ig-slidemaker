import "server-only";

export type SplitEvent =
  | { type: "slide_start"; index: number; slideType: string }
  | { type: "slide_delta"; index: number; chunk: string }
  | { type: "slide_done"; index: number; html: string }
  | { type: "between"; chunk: string };

const OPEN_RE = /<!--\s*SLIDE\s*:\s*([a-zA-Z0-9_-]+)\s*-->/;
const CLOSE_MARKER = "<!--/SLIDE-->";

// Secondary fallback parser for content received without explicit SLIDE markers.
const SECTION_OPEN_RE = /<section\b[^>]*class\s*=\s*"([^"]*)"[^>]*>/i;
const SECTION_CLOSE_RE = /<\/section>/i;
const TYPE_CLASS_RE = /\bslide--([a-zA-Z0-9_-]+)\b/;

/**
 * Streaming parser that turns Claude's text deltas into per-slide events.
 *
 * Contract expected on input:
 *   <!--SLIDE:TYPE-->
 *   <section class="slide slide--TYPE" ...>...</section>
 *   <!--/SLIDE-->
 *
 * Behavior:
 *   - text outside slide markers is emitted as `between` events (used for diagnostics)
 *   - on `flush()`, any leftover buffer is scanned with a `<section class="slide ...">`
 *     fallback parser so partial / unmarked output is still salvageable
 */
export class SlideSplitter {
  private buffer = "";
  private state: "outside" | "inside" = "outside";
  private currentIndex = -1;
  private currentType = "";
  private currentHtml = "";
  private nextIndex = 0;

  feed(chunk: string): SplitEvent[] {
    this.buffer += chunk;
    return this.drain();
  }

  flush(): SplitEvent[] {
    const events = this.drain();
    if (this.state === "outside" && this.buffer.length > 0) {
      // Try to salvage <section class="slide ..."> blocks without markers.
      events.push(...this.fallbackParseFromBuffer());
      this.buffer = "";
    } else if (this.state === "inside") {
      // Unterminated slide — emit what we have so the client at least sees it.
      events.push({
        type: "slide_done",
        index: this.currentIndex,
        html: this.currentHtml,
      });
      this.state = "outside";
      this.currentIndex = -1;
      this.currentType = "";
      this.currentHtml = "";
      this.buffer = "";
    }
    return events;
  }

  private drain(): SplitEvent[] {
    const events: SplitEvent[] = [];

    // Loop: while we can make progress, keep consuming the buffer.
    // We avoid emitting partial deltas that contain a marker tail — we hold
    // back at most a few chars so we don't split a marker across deltas.
    while (this.buffer.length > 0) {
      if (this.state === "outside") {
        const m = OPEN_RE.exec(this.buffer);
        if (!m) {
          // No open marker yet. Surface as `between` text but keep a small tail
          // that might contain the start of a marker.
          const safeLen = Math.max(0, this.buffer.length - 32);
          if (safeLen > 0) {
            const text = this.buffer.slice(0, safeLen);
            if (text.trim().length > 0) {
              events.push({ type: "between", chunk: text });
            }
            this.buffer = this.buffer.slice(safeLen);
          }
          break;
        }
        const before = this.buffer.slice(0, m.index);
        if (before.trim().length > 0) {
          events.push({ type: "between", chunk: before });
        }
        this.currentType = m[1];
        this.currentIndex = this.nextIndex;
        this.nextIndex += 1;
        this.currentHtml = "";
        this.state = "inside";
        this.buffer = this.buffer.slice(m.index + m[0].length);
        events.push({
          type: "slide_start",
          index: this.currentIndex,
          slideType: this.currentType,
        });
        continue;
      }

      // inside
      const closeIdx = this.buffer.indexOf(CLOSE_MARKER);
      if (closeIdx === -1) {
        // No close yet. Emit body bytes, but reserve a tail in case a marker is mid-flight.
        const safeLen = Math.max(0, this.buffer.length - CLOSE_MARKER.length);
        if (safeLen > 0) {
          const piece = this.buffer.slice(0, safeLen);
          this.currentHtml += piece;
          events.push({ type: "slide_delta", index: this.currentIndex, chunk: piece });
          this.buffer = this.buffer.slice(safeLen);
        }
        break;
      }
      const tail = this.buffer.slice(0, closeIdx);
      if (tail.length > 0) {
        this.currentHtml += tail;
        events.push({ type: "slide_delta", index: this.currentIndex, chunk: tail });
      }
      events.push({
        type: "slide_done",
        index: this.currentIndex,
        html: this.currentHtml,
      });
      this.buffer = this.buffer.slice(closeIdx + CLOSE_MARKER.length);
      this.state = "outside";
      this.currentIndex = -1;
      this.currentType = "";
      this.currentHtml = "";
    }

    return events;
  }

  private fallbackParseFromBuffer(): SplitEvent[] {
    const events: SplitEvent[] = [];
    let rest = this.buffer;
    while (rest.length > 0) {
      const open = SECTION_OPEN_RE.exec(rest);
      if (!open) break;
      const classAttr = open[1];
      const typeMatch = TYPE_CLASS_RE.exec(classAttr);
      const slideType = typeMatch ? typeMatch[1] : "unknown";
      const afterOpen = rest.slice(open.index);
      const close = SECTION_CLOSE_RE.exec(afterOpen);
      if (!close) break;
      const html = afterOpen.slice(0, close.index + close[0].length);
      const index = this.nextIndex;
      this.nextIndex += 1;
      events.push({ type: "slide_start", index, slideType });
      events.push({ type: "slide_delta", index, chunk: html });
      events.push({ type: "slide_done", index, html });
      rest = afterOpen.slice(close.index + close[0].length);
    }
    return events;
  }
}
