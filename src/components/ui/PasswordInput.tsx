"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

/** Password field with a show/hide toggle. */
export function PasswordInput({
  id,
  name,
  required,
  minLength,
  autoComplete,
  placeholder,
  className,
  withLockIcon,
}: {
  id?: string;
  name: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  /** Renders a lock icon inside the field's left edge (login style). */
  withLockIcon?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {withLockIcon && (
        <Lock
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light/50 pointer-events-none"
        />
      )}
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${className ?? ""} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--ink-faint)] hover:text-charcoal"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
