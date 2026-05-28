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
    <div className="slide-count">
      <label
        className="slide-count__auto"
        aria-disabled={disabled || undefined}
      >
        <input
          type="checkbox"
          checked={isAuto}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "auto" : numericValue)}
        />
        <span>自動（内容に合わせて決める）</span>
      </label>

      <div className="slide-count__row">
        <input
          type="number"
          className="glass-input"
          value={numericValue}
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
        />
        <span className="slide-count__hint">
          {isAuto ? "枚数はモデルが判断します" : `枚（${MIN}〜${MAX}）`}
        </span>
      </div>
    </div>
  );
}
