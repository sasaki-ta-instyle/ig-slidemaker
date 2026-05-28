import { listTemplates, loadTemplate, getPaletteList } from "@/lib/templates/registry";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const templates = await listTemplates();
    // Enrich each template with its palette list (so the UI can render the
    // palette selector without a second round-trip per template).
    const enriched = await Promise.all(
      templates.map(async (meta) => {
        try {
          const tpl = await loadTemplate(meta.id);
          return {
            ...meta,
            palettes: getPaletteList(tpl),
            defaultPalette: tpl.defaultPalette,
          };
        } catch {
          return { ...meta, palettes: [], defaultPalette: "" };
        }
      }),
    );
    return Response.json({ ok: true, templates: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, code: "load_failed", message }, { status: 500 });
  }
}
