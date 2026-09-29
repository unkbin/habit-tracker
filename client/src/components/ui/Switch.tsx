import clsx from "clsx";
import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

/** An on/off setting: a native checkbox (keyboard and screen readers work as usual) drawn as a switch. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, disabled, ...props },
  ref,
) {
  const id = useId();
  return (
    <div className={clsx("flex min-h-11 items-center justify-between gap-4", className)}>
      <label htmlFor={id} className={clsx("flex-1", disabled && "opacity-60")}>
        <span className="block text-body font-medium">{label}</span>
        {description && <span className="block text-caption text-muted">{description}</span>}
      </label>
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
          disabled={disabled}
          {...props}
          className="peer h-7 w-12 cursor-pointer appearance-none rounded-full bg-surface-2 ring-1 ring-border transition-colors checked:bg-primary checked:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
});
