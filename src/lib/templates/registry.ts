import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  designSystem: "liquid" | "flat";
  aspect: string;
  viewportWidth: number;
  viewportHeight: number;
  maxSlides: number;
  supportsImages: boolean;
  slideTypes: string[];
  imageGuidance?: string;
  scaffoldOrder?: string[];
}

export interface PaletteInfo {
  id: string;
  label: string;
}

export interface Template {
  id: string;
  meta: TemplateMeta;
  shellHead: string;
  shellTail: string;
  slides: Record<string, string>;
  readme: string;
  palettes: Record<string, string>; // paletteId -> CSS (replaces PALETTE_BEGIN/END block)
  defaultPalette: string;
}

const TEMPLATES_ROOT = path.join(process.cwd(), "src/templates");
const PALETTE_REGEX =
  /\/\* PALETTE_BEGIN[\s\S]*?\/\* PALETTE_END \*\//;

const templateCache = new Map<string, Template>();
let metaListCache: TemplateMeta[] | null = null;

/** Apply a palette CSS by replacing the PALETTE_BEGIN/END block in shellHead. */
export function applyPalette(shellHead: string, paletteCss: string): string {
  const trimmed = paletteCss.trim();
  const replacement = `/* PALETTE_BEGIN — applied at request time */\n${trimmed}\n/* PALETTE_END */`;
  if (!PALETTE_REGEX.test(shellHead)) {
    return shellHead;
  }
  return shellHead.replace(PALETTE_REGEX, replacement);
}

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

async function loadTemplateFromDisk(id: string): Promise<Template> {
  const dir = path.join(TEMPLATES_ROOT, id);
  const metaRaw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
  const meta = JSON.parse(metaRaw) as TemplateMeta;

  if (meta.id !== id) {
    throw new Error(
      `Template meta.json id (${meta.id}) does not match directory name (${id})`,
    );
  }

  const [shellHead, shellTail, readme] = await Promise.all([
    fs.readFile(path.join(dir, "shell-head.html"), "utf8"),
    fs.readFile(path.join(dir, "shell-tail.html"), "utf8"),
    readIfExists(path.join(dir, "README.md")),
  ]);

  const slidesDir = path.join(dir, "slides");
  const slides: Record<string, string> = {};
  let slideEntries: string[] = [];
  try {
    slideEntries = await fs.readdir(slidesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await Promise.all(
    slideEntries
      .filter((name) => name.endsWith(".html"))
      .map(async (name) => {
        const type = name.replace(/\.html$/, "");
        slides[type] = await fs.readFile(path.join(slidesDir, name), "utf8");
      }),
  );

  const palettesDir = path.join(dir, "palettes");
  const palettes: Record<string, string> = {};
  let paletteEntries: string[] = [];
  try {
    paletteEntries = await fs.readdir(palettesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await Promise.all(
    paletteEntries
      .filter((name) => name.endsWith(".css"))
      .map(async (name) => {
        const pid = name.replace(/\.css$/, "");
        palettes[pid] = await fs.readFile(path.join(palettesDir, name), "utf8");
      }),
  );

  const defaultPalette = "ig" in palettes ? "ig" : Object.keys(palettes)[0] ?? "";

  return {
    id,
    meta,
    shellHead,
    shellTail,
    slides,
    readme,
    palettes,
    defaultPalette,
  };
}

export function getPaletteList(tpl: Template): PaletteInfo[] {
  return Object.keys(tpl.palettes)
    .sort()
    .map((id) => ({ id, label: id }));
}

export async function loadTemplate(id: string): Promise<Template> {
  const cached = templateCache.get(id);
  if (cached) return cached;
  const tpl = await loadTemplateFromDisk(id);
  templateCache.set(id, tpl);
  return tpl;
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  if (metaListCache) return metaListCache;

  let entries: string[] = [];
  try {
    entries = await fs.readdir(TEMPLATES_ROOT);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      metaListCache = [];
      return metaListCache;
    }
    throw err;
  }

  const metas: TemplateMeta[] = [];
  for (const name of entries) {
    const stat = await fs.stat(path.join(TEMPLATES_ROOT, name));
    if (!stat.isDirectory()) continue;
    try {
      const raw = await fs.readFile(
        path.join(TEMPLATES_ROOT, name, "meta.json"),
        "utf8",
      );
      const meta = JSON.parse(raw) as TemplateMeta;
      metas.push(meta);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }

  metas.sort((a, b) => a.id.localeCompare(b.id));
  metaListCache = metas;
  return metas;
}
