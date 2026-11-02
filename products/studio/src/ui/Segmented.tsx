import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  mode = "tab",
  idPrefix,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  mode?: "tab" | "toggle";
  idPrefix?: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabMode = mode === "tab";
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!tabMode) return;
    const enabled = options
      .map((option, optionIndex) => (option.disabled ? -1 : optionIndex))
      .filter((optionIndex) => optionIndex >= 0);
    if (!enabled.length) return;
    let next: number | null = null;
    const position = enabled.indexOf(index);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = enabled[(position - 1 + enabled.length) % enabled.length];
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = enabled[(position + 1) % enabled.length];
    } else if (event.key === "Home") {
      next = enabled[0];
    } else if (event.key === "End") {
      next = enabled[enabled.length - 1];
    }
    if (next === null || next === undefined) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={cn("seg", className)} role={tabMode ? "tablist" : "group"} aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            id={tabMode && idPrefix ? `${idPrefix}-${option.value}` : undefined}
            type="button"
            role={tabMode ? "tab" : undefined}
            aria-selected={tabMode ? selected : undefined}
            aria-pressed={tabMode ? undefined : selected}
            aria-controls={tabMode && idPrefix ? `${idPrefix}-panel` : undefined}
            tabIndex={tabMode ? (selected ? 0 : -1) : undefined}
            disabled={option.disabled}
            title={option.title}
            aria-label={option.ariaLabel}
            className={selected ? "is-on" : ""}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
