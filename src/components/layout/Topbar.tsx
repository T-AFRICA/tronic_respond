import { Search, LogOut, Menu } from "lucide-react";
import { logout } from "@/app/login/actions";
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
    <header className="h-14 bg-white/95 backdrop-blur border-b border-neutral-border flex items-center gap-3 sm:gap-4 px-3 sm:px-5 sticky top-0 z-20">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 rounded-lg border border-neutral-border bg-white flex items-center justify-center text-charcoal-light hover:text-charcoal shrink-0"
        title="Menu"
      >
        <Menu size={18} strokeWidth={1.9} />
      </button>

      {/* Global product search */}
      <form action="/dashboard/products" className="relative w-full max-w-md">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light/60 pointer-events-none"
        />
        <input
          type="search"
          name="q"
          placeholder="Search products by SKU, name, brand…"
          className="w-full h-9 rounded-lg border border-neutral-border bg-neutral-bg/60 pl-9 pr-3 text-[13px] placeholder:text-charcoal-light/50 focus:bg-white focus:outline-none focus:border-charcoal-light/40 transition-colors"
        />
      </form>

      <div className="flex items-center gap-2 sm:gap-2.5 ml-auto shrink-0">
        <NotificationsBell notifications={notifications} unreadCount={unreadCount} />

        <div className="hidden sm:block h-6 w-px bg-neutral-border mx-1" />

        <div className="flex items-center gap-2.5">
          <span className="hidden sm:flex w-9 h-9 rounded-full bg-charcoal text-white text-xs font-bold items-center justify-center">
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
            className="w-9 h-9 rounded-lg border border-neutral-border bg-white flex items-center justify-center text-charcoal-light hover:text-tronic-red hover:border-tronic-red/40 transition-colors"
          >
            <LogOut size={16} strokeWidth={1.9} />
          </button>
        </form>
      </div>
    </header>
  );
}
