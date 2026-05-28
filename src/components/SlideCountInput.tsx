"use client";

const MIN = 5;
const MAX = 40;

export type SlideCountValue = number | "auto";

export function SlideCountInput({
  value,
  onChange,
  disabled,
}: {
  value: SlideCountValue;
  onChange: (v: SlideCountValue) => void;
  disabled?: boolean;
}) {
  const isAuto = value === "auto";
  const numericValue = typeof value === "number" ? value : 12;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={isAuto}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "auto" : numericValue)}
        />
        <span>自動（内容から成り行きで決める）</span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="number"
          className="slide-count-input"
          value={isAuto ? "" : numericValue}
          placeholder={isAuto ? "auto" : undefined}
          min={MIN}
          max={MAX}
          step={1}
          disabled={disabled || isAuto}
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
            background: isAuto ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
          }}
        />
        <span style={{ fontSize: 13, color: "var(--color-text-soft, #82837A)" }}>
          {isAuto ? "枚数はモデルが判断します" : `枚（${MIN}〜${MAX}）`}
        </span>
      </div>
    </div>
  );
}
