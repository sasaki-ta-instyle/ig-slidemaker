"use client";
import { useEffect, useState } from "react";

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
}

export function TemplateSelect({
  value,
  onChange,
  disabled,
  basePath,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  basePath: string;
}) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/templates`, { cache: "no-store" });
        const data: { ok?: boolean; templates?: TemplateOption[]; message?: string } =
          await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.templates) {
          setLoadError(data.message ?? `テンプレ一覧の取得に失敗しました (HTTP ${res.status})`);
          return;
        }
        setTemplates(data.templates);
        // If the current value isn't in the list, default to the first.
        if (data.templates.length > 0 && !data.templates.some((t) => t.id === value)) {
          onChange(data.templates[0].id);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError((err as Error).message ?? "ネットワークエラー");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  return (
    <div>
      <select
        className="template-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || templates.length === 0}
      >
        {templates.length === 0 && <option value="">読み込み中…</option>}
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {loadError && <div className="toast">{loadError}</div>}
      {templates.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--color-text-soft, #82837A)", marginTop: 6 }}>
          {templates.find((t) => t.id === value)?.description ?? ""}
        </div>
      )}
    </div>
  );
}
