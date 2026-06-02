#!/usr/bin/env node
// Sync src/templates/presentation-liquid/{shell-head,shell-tail,slides/*}
// from the canonical single-file template at ../ig-slidemaker-template/index.html.
//
// Resolution order:
//   1. SLIDE_TEMPLATE_LIQUID env (absolute path override)
//   2. <cwd>/../ig-slidemaker-template/index.html (default, relative to repo root)
//
// Per-slide post-processing:
//   - image-figure: <img src="data:image/svg+xml,...">  →  <img data-bank-id="img-001">
//   - image-grid  : 4 <img>s                             →  data-bank-id="img-002" 〜 "img-005"
//   - other slide types: pass through unchanged
//
// Idempotency: existing src/templates/<template>/slides/*.html are wiped at
// the start of each run so that retired slide types (e.g. closing / quote)
// do not linger as orphans for the prompt builder to pick up.

import fs from "node:fs/promises";
import path from "node:path";

const STANDALONE =
  process.env.SLIDE_TEMPLATE_LIQUID ??
  path.resolve(process.cwd(), "../ig-slidemaker-template/index.html");

const TARGET = path.join(process.cwd(), "src/templates/presentation-liquid");

const HEAD_END = '<main class="deck" id="deck">';
const TAIL_START = "  </main>\n</div>";

function log(msg) {
  process.stdout.write(`[sync-template] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[sync-template] WARN: ${msg}\n`);
}

function rewriteImageSlide(html, startIndex) {
  let i = startIndex;
  // Split into comment / non-comment segments so we don't rewrite <img> mentions
  // that live inside HTML comments (those are author notes for the standalone).
  const parts = html.split(/(<!--[\s\S]*?-->)/g);
  return parts
    .map((part) => {
      if (part.startsWith("<!--")) return part;
      return part.replace(/<img\b[^>]*?\/?>/g, (tag) => {
        const altMatch = tag.match(/alt="([^"]*)"/);
        const alt = altMatch ? altMatch[1] : "";
        const id = `img-${String(i++).padStart(3, "0")}`;
        return `<img data-bank-id="${id}" alt="${alt}" />`;
      });
    })
    .join("");
}

function dedent(body) {
  return (
    body
      .split("\n")
      .map((line) => (line.startsWith("    ") ? line.slice(4) : line))
      .join("\n")
      .trim() + "\n"
  );
}

async function main() {
  const src = await fs.readFile(STANDALONE, "utf8");

  const headEnd = src.indexOf(HEAD_END);
  if (headEnd < 0) {
    throw new Error(`shell-head end marker not found: ${HEAD_END}`);
  }
  const headEndPos = headEnd + HEAD_END.length;

  const tailStart = src.indexOf(TAIL_START, headEndPos);
  if (tailStart < 0) {
    throw new Error(`shell-tail start marker not found: ${TAIL_START}`);
  }

  const shellHead = src.slice(0, headEndPos) + "\n";
  const slidesRegion = src.slice(headEndPos, tailStart);
  const shellTail = src.slice(tailStart);

  // Extract each top-level <section class="slide slide--TYPE" ...> ... </section>
  // Slides do not nest, so a non-greedy single-pass regex is safe here.
  const SLIDE_RE =
    /<section class="slide slide--([a-z0-9-]+)"[^>]*data-slide="([a-z0-9-]+)"[\s\S]*?<\/section>/g;

  const slides = {};
  let m;
  while ((m = SLIDE_RE.exec(slidesRegion))) {
    const type = m[2];
    let body = m[0];

    if (type === "image-figure") {
      body = rewriteImageSlide(body, 1);
    } else if (type === "image-grid") {
      body = rewriteImageSlide(body, 2);
    }

    slides[type] = dedent(body);
  }

  // Filter against meta.json slideTypes (ig-slidemaker's contract).
  const metaPath = path.join(TARGET, "meta.json");
  const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
  const allowed = new Set(meta.slideTypes);

  const slidesDir = path.join(TARGET, "slides");
  await fs.mkdir(slidesDir, { recursive: true });

  // Idempotency: wipe any pre-existing slide html so retired types don't linger.
  // We keep non-html siblings (README etc) untouched.
  const existing = await fs.readdir(slidesDir);
  let removed = 0;
  for (const name of existing) {
    if (name.endsWith(".html")) {
      await fs.rm(path.join(slidesDir, name));
      removed += 1;
    }
  }
  if (removed > 0) log(`wiped ${removed} pre-existing slides/*.html`);

  await fs.writeFile(path.join(TARGET, "shell-head.html"), shellHead);
  await fs.writeFile(path.join(TARGET, "shell-tail.html"), shellTail);
  log(`shell-head.html  (${shellHead.length}B)`);
  log(`shell-tail.html  (${shellTail.length}B)`);

  let written = 0;
  for (const [type, body] of Object.entries(slides)) {
    if (!allowed.has(type)) {
      warn(`skip slide '${type}' (not in meta.json slideTypes)`);
      continue;
    }
    await fs.writeFile(path.join(slidesDir, `${type}.html`), body);
    log(`slides/${type}.html  (${body.length}B)`);
    written += 1;
  }

  for (const t of allowed) {
    if (!slides[t]) {
      warn(`meta declares '${t}' but standalone has no such slide`);
    }
  }

  log(`done — ${written}/${allowed.size} slides synced from ${STANDALONE}`);
}

main().catch((err) => {
  process.stderr.write(`[sync-template] ERROR: ${err.message}\n`);
  process.exit(1);
});
