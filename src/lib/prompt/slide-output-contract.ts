import "server-only";

export const SLIDE_OUTPUT_CONTRACT = `SLIDE OUTPUT CONTRACT (STRICT)

1. Output ONLY a sequence of slides. Do not emit prose, code fences, or any text outside the slide markers.
2. Each slide MUST be wrapped exactly as:
   <!--SLIDE:TYPE-->
   <section class="slide slide--TYPE" data-slide="TYPE" data-title="NN. 短いラベル">
     ...
   </section>
   <!--/SLIDE-->
3. TYPE must be one of the slide types declared in the template's meta.json (do not invent new types).
4. data-title must be in the form "NN. label" (NN = two-digit slide number starting at 01). It is rendered in the timeline at the top of the deck.
5. Do NOT add the "is-active" class. The shell's navigation script toggles it on the current slide.
6. Do NOT include <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> — the shell is provided by the server.
7. Do NOT use CSS custom properties or class names that are not defined in the template's shell <style>. Only use the classes shown in slides/*.html samples.
8. For images, use ONLY <img data-bank-id="img-XX" alt="..."> placeholders. Do NOT write src="". The server replaces data-bank-id with the actual image after generation.
9. Preserve the structural skeleton of slides/<TYPE>.html exactly (DOM tree, class names, data-* attributes). Only replace the human text inside.
10. The opening slide MUST be \`cover\`. There is no mandatory final slide type — end naturally with body / section / image-figure.
11. If an image bank entry has sourceType="page", treat it as a verbatim page capture from the source PDF — only use it when explicitly relevant.
12. Do NOT write inline color values, gradients, or rgba in style attributes — use only the class names that already exist in the shell <style>.
13. The color --color-highlight (#E2DD2A) is RESERVED for inline text emphasis via <mark> ONLY. Never use it for backgrounds, CTAs, borders, fills, or as a slide accent color.

CONTENT FIDELITY (CRITICAL)

The source material is the source of truth. Your job is to RE-PRESENT it in slide form, not to edit it.

- Preserve EVERY substantive idea, section, claim, datapoint, name, number, and example from the source. If the source has 12 sections, all 12 must surface in the deck (you may merge tightly-related ones into a single slide, but do not silently drop any).
- You MAY adjust the FRAMING — write a fresh slide title, distill a one-line lede, choose a layout (cover / agenda / section / body / image-figure / image-grid), assign content to cards, decide what to <mark>, pick which image goes in image-figure vs image-grid.
- You MAY NOT:
  - delete content because it "doesn't fit" — add another slide instead
  - rewrite or paraphrase substantive sentences in a way that changes meaning
  - summarize multiple paragraphs into a single sentence that loses information
  - invent content not present in the source
  - "improve" the source's claims, soften its tone, or correct its statements
- Captions on images, agenda entries, and section titles SHOULD be your own concise wording — those are slide-specific framing, not source content.
- If the source is short, the deck is short. Do not pad. If the source is long, the deck is long (up to maxSlides).
- The user will give explicit refine instructions later if they want substantive edits. Until then, treat the source as immutable.

LINE BREAKS (<br>) IN JAPANESE TEXT

- Use <br> ONLY in display text — slide titles (.t-display / .t-h1 / .t-h2), section titles, leads (.lede), agenda titles. Do NOT put <br> inside body paragraphs or card descriptions; let them wrap naturally.
- When you DO use <br>, break at Japanese 文節 (phrase) boundaries:
  - After particles: は / が / を / に / で / と / から / まで / より / の / へ / や / も
  - After punctuation: 、 「 」 ・
  - After conjunctive forms: 〜て / 〜で / 〜けれど / 〜が / 〜ので / 〜なら / 〜たら
  - NEVER break mid-word, mid-particle, mid-数字, or right before a single trailing character (孤立した一文字を残さない)
- Balance line lengths. If one line is more than ~1.6× the length of the other, reposition the break to a different phrase boundary, OR drop the <br> entirely.
- 1 行で収まる短い文には <br> を入れない（見た目のためだけの改行はしない）。
- Hard cap: at most 2 lines per display heading. If text doesn't fit in 2 lines, shorten the wording or step down to a smaller class (.t-h2 → .t-h3) — do not stack 3+ lines.
- For card labels / .t-small / .t-body, never insert <br>.
`;
