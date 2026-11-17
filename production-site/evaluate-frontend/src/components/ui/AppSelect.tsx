import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cx } from "../../lib/format";

const EMPTY_VALUE = "__molly_select_empty__";

export type AppSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
};

export function AppSelect({
  label,
  ariaLabel,
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  disabled = false,
  error,
  size = "default",
  icon,
  required,
  name,
  className,
  triggerClassName,
}: {
  label?: string;
  ariaLabel?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  size?: "compact" | "default";
  icon?: ReactNode;
  required?: boolean;
  name?: string;
  className?: string;
  triggerClassName?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const normalizedValue = value === "" ? EMPTY_VALUE : value;

  return (
    <div className={cx("app-select-field", className)}>
      {label ? <span id={labelId} className="app-select-label">{label}</span> : null}
      <Select.Root
        name={name}
        required={required}
        disabled={disabled}
        value={normalizedValue}
        onValueChange={(nextValue) => onValueChange(nextValue === EMPTY_VALUE ? "" : nextValue)}
      >
        <Select.Trigger
          aria-label={!label ? ariaLabel : undefined}
          aria-labelledby={label ? labelId : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cx("app-select-trigger", size === "compact" && "app-select-trigger-compact", triggerClassName)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon ? <span className="app-select-leading-icon" aria-hidden="true">{icon}</span> : null}
            <Select.Value placeholder={placeholder} />
          </span>
          <Select.Icon className="app-select-chevron"><ChevronDown className="h-4 w-4" aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className="app-select-content"
          >
            <Select.ScrollUpButton className="app-select-scroll-button"><ChevronUp className="h-4 w-4" /></Select.ScrollUpButton>
            <Select.Viewport className="app-select-viewport">
              {options.map((option) => (
                <Select.Item
                  key={option.value || EMPTY_VALUE}
                  value={option.value || EMPTY_VALUE}
                  disabled={option.disabled}
                  className="app-select-option"
                >
                  <span className="app-select-option-indicator"><Select.ItemIndicator><Check className="h-4 w-4" aria-hidden="true" /></Select.ItemIndicator></span>
                  <span className="app-select-option-body">
                    {option.icon ? <span className="app-select-option-icon" aria-hidden="true">{option.icon}</span> : null}
                    <span className="min-w-0">
                      <Select.ItemText>{option.label}</Select.ItemText>
                      {option.description ? <span className="app-select-option-description">{option.description}</span> : null}
                    </span>
                  </span>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="app-select-scroll-button"><ChevronDown className="h-4 w-4" /></Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {error ? <span id={errorId} className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
    </div>
  );
}
