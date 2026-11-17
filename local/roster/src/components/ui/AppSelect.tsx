import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export function AppSelect({ label, ariaLabel, value, onValueChange, options, disabled = false }: {
  label?: string;
  ariaLabel?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      {label ? <span className="mb-1.5 block text-sm font-semibold text-graphite-700">{label}</span> : null}
      <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <Select.Trigger className="app-select-trigger" aria-label={ariaLabel ?? label}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4" /></Select.Icon></Select.Trigger>
        <Select.Portal><Select.Content position="popper" sideOffset={6} className="app-select-content"><Select.Viewport className="p-1">{options.map((option) => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="app-select-option"><Select.ItemIndicator className="text-brand-700"><Check className="h-4 w-4" /></Select.ItemIndicator><Select.ItemText>{option.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
      </Select.Root>
    </label>
  );
}
