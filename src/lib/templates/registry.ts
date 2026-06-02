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

export interface Template {
  id: string;
  meta: TemplateMeta;
  shellHead: string;
  shellTail: string;
  slides: Record<string, string>;
  readme: string;
}

const TEMPLATES_ROOT = path.join(process.cwd(), "src/templates");

const templateCache = new Map<string, Template>();
let metaListCache: TemplateMeta[] | null = null;

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

  return {
    id,
    meta,
    shellHead,
    shellTail,
    slides,
    readme,
  };
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
