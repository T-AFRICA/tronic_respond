import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Consistent empty state for lists and tables.
 * Use inside a full-width container (or a td with colSpan).
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="py-12 px-6 text-center">
      <span className="inline-flex w-12 h-12 rounded-xl bg-neutral-bg items-center justify-center">
        <Icon size={22} strokeWidth={1.6} className="text-charcoal-light/60" />
      </span>
      <p className="text-sm font-semibold mt-3">{title}</p>
      {hint && (
        <p className="text-xs text-charcoal-light mt-1 max-w-sm mx-auto leading-relaxed">
          {hint}
        </p>
      )}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-block mt-4 text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded-lg px-4 py-2"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
