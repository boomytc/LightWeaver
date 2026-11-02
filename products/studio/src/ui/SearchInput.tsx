// Adapted from OpenSource UI search-input (MIT).
// Copyright (c) 2026 Bidyut Kundu. https://github.com/bidyut10/opensourceui
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
} from "react";
import { cn } from "./cn";

export type SearchInputProps = {
  label?: string;
  hint?: string;
  error?: boolean;
  errorMessage?: string;
  clearLabel?: string;
  containerClassName?: string;
  onClear?: () => void;
} & Omit<ComponentPropsWithoutRef<"input">, "size" | "type" | "onChange"> & {
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    className,
    containerClassName,
    id,
    label = "查找",
    hint,
    error = false,
    errorMessage = "请输入可查找的内容。",
    clearLabel = "清除",
    disabled,
    value,
    defaultValue = "",
    placeholder = "查找",
    onChange,
    onClear,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const localRef = useRef<HTMLInputElement | null>(null);
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(String(defaultValue));
  const current = isControlled ? String(value) : internal;
  const hasValue = current.length > 0;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      if (!isControlled) setInternal(next);
      onChange?.(next, event);
    },
    [isControlled, onChange],
  );
  const handleClear = useCallback(() => {
    if (!isControlled) setInternal("");
    onClear?.();
    localRef.current?.focus();
  }, [isControlled, onClear]);
  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    if (isControlled) return;
    const form = localRef.current?.form;
    if (!form) return;
    const handleReset = () => setInternal(String(defaultValue));
    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [defaultValue, isControlled]);

  return (
    <div data-slot="search-input" data-error={error || undefined} className={cn("w-full font-sans", containerClassName)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          ref={setRefs}
          id={inputId}
          type="search"
          role="searchbox"
          disabled={disabled}
          value={current}
          placeholder={placeholder}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={handleChange}
          className={cn(
            "h-9 w-full rounded-[10px] border border-line bg-panel py-2 pr-16 pl-3 text-sm text-ink placeholder:text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-50",
            "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
            className,
          )}
          {...props}
        />
        {hasValue && !disabled ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={handleClear}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 border-0 bg-transparent px-1.5 py-0.5 text-xs font-medium text-muted shadow-none hover:text-ink"
          >
            清除
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {errorMessage}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
