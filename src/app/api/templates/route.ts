import { listTemplates } from "@/lib/templates/registry";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const templates = await listTemplates();
    return Response.json({ ok: true, templates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, code: "load_failed", message }, { status: 500 });
  }
}
