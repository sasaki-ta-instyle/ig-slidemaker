"use client";

const MIN = 5;
const MAX = 40;

export function SlideCountInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <input
        type="number"
        className="slide-count-input"
        value={value}
        min={MIN}
        max={MAX}
        step={1}
        disabled={disabled}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (!Number.isFinite(raw)) return;
          const clamped = Math.max(MIN, Math.min(MAX, Math.round(raw)));
          onChange(clamped);
        }}
        style={{
          width: 96,
          padding: "8px 12px",
          fontSize: 15,
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.6)",
        }}
      />
      <span style={{ fontSize: 13, color: "var(--color-text-soft, #82837A)" }}>
        枚（{MIN}〜{MAX}）
      </span>
    </div>
  );
}
