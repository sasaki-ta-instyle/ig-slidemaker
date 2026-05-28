"use client";

import { useEffect, useState } from "react";

export interface PaletteOption {
  id: string;
  label: string;
}

export function PaletteSelect({
  value,
  onChange,
  disabled,
  basePath,
  template,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  basePath: string;
  template: string;
}) {
  const [options, setOptions] = useState<PaletteOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${basePath}/api/templates`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        const tpl = (data.templates ?? []).find(
          (t: { id: string }) => t.id === template,
        );
        const palettes: PaletteOption[] = tpl?.palettes ?? [];
        setOptions(palettes);
        if (palettes.length > 0 && !palettes.some((p) => p.id === value)) {
          onChange(tpl?.defaultPalette || palettes[0].id);
        }
      })
      .catch(() => {
        /* ignore — UI keeps its current value */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, template]);

  if (options.length <= 1) {
    return null; // Hide selector when there's nothing to choose.
  }

  return (
    <div className="palette-select">
      {options.map((opt) => {
        const checked = opt.id === value;
        return (
          <label
            key={opt.id}
            className="glass-radio-label"
            data-checked={checked ? "true" : "false"}
            aria-disabled={disabled || undefined}
          >
            <input
              type="radio"
              name="palette"
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(opt.id)}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
