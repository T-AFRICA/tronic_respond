import { LogOut, Menu } from "lucide-react";
import { logout } from "@/app/login/actions";
import { ProductSearchBox } from "@/components/search/ProductSearchBox";
import {
  NotificationsBell,
  type NotificationItem,
} from "@/components/layout/NotificationsBell";

export function Topbar({
  name,
  roleName,
  notifications,
  unreadCount,
  onMenuClick,
}: {
  name: string;
  roleName: string;
  notifications: NotificationItem[];
  unreadCount: number;
  onMenuClick?: () => void;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="h-14 bg-[#fafaf9]/90 backdrop-blur border-b border-[var(--hairline)] flex items-center gap-3 sm:gap-4 px-3 sm:px-6 sticky top-0 z-20">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 rounded-[7px] border border-[var(--hairline)] bg-white flex items-center justify-center text-[var(--ink-muted)] hover:text-charcoal shrink-0"
        title="Menu"
      >
        <Menu size={18} strokeWidth={1.9} />
      </button>

      {/* Global product search */}
      <form action="/dashboard/products" className="w-full max-w-md">
        <ProductSearchBox
          scope="admin"
          placeholder="Search products by SKU, name, brand…"
          inputClassName="w-full h-8 rounded-[7px] border border-[var(--hairline)] bg-white pl-8 pr-8 text-[13px] placeholder:text-[var(--ink-faint)] focus:outline-none"
        />
      </form>

      <div className="flex items-center gap-2 sm:gap-2.5 ml-auto shrink-0">
        <NotificationsBell notifications={notifications} unreadCount={unreadCount} />

        <div className="hidden sm:block h-6 w-px bg-neutral-border mx-1" />

        <div className="flex items-center gap-2.5">
          <span className="hidden sm:flex w-7 h-7 rounded-full bg-charcoal text-white text-[10px] font-bold items-center justify-center">
            {initials || "?"}
          </span>
          <span className="hidden sm:block leading-tight">
            <span className="block text-[13px] font-semibold">{name}</span>
            <span className="block text-[11px] text-charcoal-light">{roleName}</span>
          </span>
        </div>

        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            className="w-8 h-8 rounded-[7px] border border-[var(--hairline)] bg-white flex items-center justify-center text-[var(--ink-muted)] hover:text-tronic-red hover:border-tronic-red/30"
          >
            <LogOut size={16} strokeWidth={1.9} />
          </button>
        </form>
      </div>
    </header>
  );
}
