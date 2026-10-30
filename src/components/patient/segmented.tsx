"use client";

/**
 * A segmented control: equal segments on a tinted track, the selected one on a raised thumb that
 * slides when the choice changes (the only motion, and only in answer to a tap).
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div role="radiogroup" aria-label={label} className="relative grid rounded-[11px] bg-tl-tint p-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span
        aria-hidden="true"
        className="absolute bottom-[3px] top-[3px] rounded-[8px] bg-[var(--p-raised)] shadow-[0_1px_2px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.05)] transition-[inset-inline-start] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${n})`, insetInlineStart: `calc(3px + (100% - 6px) / ${n} * ${index})` }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative h-9 truncate px-1 text-[0.875rem] ${option.value === value ? "font-medium text-tl-ink" : "text-tl-muted hover:text-tl-ink"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
