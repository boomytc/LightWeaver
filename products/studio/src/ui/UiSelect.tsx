import * as Select from "@radix-ui/react-select";

export function UiSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger aria-label={label} className="inline-flex h-9 min-w-36 items-center justify-between gap-2 rounded-[10px] border border-line bg-panel px-3">
        <Select.Value />
        <Select.Icon>▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 overflow-hidden rounded-[10px] border border-line bg-elevated text-ink shadow-[var(--lw-shadow-menu)]">
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="cursor-pointer rounded-[6px] px-2 py-1.5 outline-none data-[highlighted]:bg-subtle-bg"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
