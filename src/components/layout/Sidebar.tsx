"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Package,
  Image as ImageIcon,
  FolderTree,
  BadgePercent,
  Store,
  Users,
  Share2,
  Megaphone,
  MessageSquareText,
  Inbox,
  FileText,
  UserCog,
  BarChart3,
  Plug,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  permission: string | null; // null = visible to all staff
  icon: LucideIcon;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "",
    items: [
      { label: "Overview", href: "/dashboard", permission: null, icon: LayoutDashboard },
    ],
  },
  {
    section: "Catalog",
    items: [
      { label: "Products", href: "/dashboard/products", permission: "products.read", icon: Package },
      { label: "Product Images", href: "/dashboard/products/images", permission: "products.write", icon: ImageIcon },
      { label: "Categories", href: "/dashboard/categories", permission: "products.read", icon: FolderTree },
      { label: "Offers", href: "/dashboard/offers", permission: "offers.read", icon: BadgePercent },
      { label: "Meta Catalog", href: "/dashboard/meta-catalog", permission: "products.read", icon: Store },
    ],
  },
  {
    section: "Customers",
    items: [
      { label: "Customers", href: "/dashboard/customers", permission: "customers.read", icon: Users },
      { label: "Product Sharing", href: "/dashboard/sharing", permission: "sharing.send", icon: Share2 },
      { label: "Broadcasting", href: "/dashboard/broadcasting", permission: "campaigns.read", icon: Megaphone },
      { label: "Message History", href: "/dashboard/message-history", permission: "customers.read", icon: MessageSquareText },
    ],
  },
  {
    section: "Sales",
    items: [
      { label: "Quotation Requests", href: "/dashboard/rfqs", permission: "rfqs.read", icon: Inbox },
      { label: "Quotations", href: "/dashboard/quotations", permission: "quotations.read", icon: FileText },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Staff Management", href: "/dashboard/staff", permission: "staff.manage", icon: UserCog },
      { label: "Reports", href: "/dashboard/reports", permission: "reports.read", icon: BarChart3 },
      { label: "Integrations", href: "/dashboard/integrations", permission: "integrations.manage", icon: Plug },
      { label: "Audit Logs", href: "/dashboard/audit-logs", permission: "audit.read", icon: ScrollText },
      { label: "Settings", href: "/dashboard/settings", permission: "settings.manage", icon: Settings },
    ],
  },
];

export function Sidebar({
  permissions,
  mobileOpen = false,
  onNavigate,
}: {
  permissions: string[];
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("tr-sidebar-collapsed") === "1");
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("tr-sidebar-collapsed", next ? "1" : "0");
  }

  // The icon-only collapsed mode is desktop-only; the mobile drawer always
  // shows full labels.
  const isCollapsed = collapsed && !mobileOpen;

  // Longest-prefix match so e.g. /dashboard/products/images highlights
  // "Product Images", not "Products".
  const allHrefs = NAV.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => (h === "/dashboard" ? pathname === h : pathname.startsWith(h)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside
      className={clsx(
        "shrink-0 bg-[#f7f7f5] text-charcoal flex flex-col transition-[width,transform] duration-200 border-r border-[var(--hairline)]",
        // Desktop: sticky column (collapsible). Mobile: off-canvas drawer.
        "fixed inset-y-0 left-0 z-40 h-dvh w-[232px] lg:sticky lg:top-0 lg:z-auto lg:h-auto lg:min-h-screen lg:max-h-screen lg:translate-x-0",
        mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
        isCollapsed ? "lg:w-[64px]" : "lg:w-[232px]",
      )}
    >
      {/* Brand — the original mark, in its own red */}
      <div
        className={clsx(
          "h-14 flex items-center border-b border-[var(--hairline)] shrink-0",
          isCollapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          {isCollapsed ? (
            <span className="display text-tronic-red text-xl font-black leading-none">
              T
            </span>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/tronic-logo.webp"
                alt="TRONIC"
                className="h-[18px] w-auto"
              />
              <span className="text-[13px] text-[var(--ink-muted)] font-normal mt-px truncate">
                Response
              </span>
            </>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 sidebar-scroll">
        {NAV.map(({ section, items }) => {
          const visible = items.filter(
            (i) => i.permission === null || permissions.includes(i.permission),
          );
          if (visible.length === 0) return null;
          return (
            <div key={section || "root"} className="mb-1">
              {section &&
                (isCollapsed ? (
                  <div className="mx-3 my-2 border-t border-[var(--hairline)]" />
                ) : (
                  <p className="px-4 pt-4 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-faint)] font-medium select-none">
                    {section}
                  </p>
                ))}
              {visible.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={isCollapsed ? item.label : undefined}
                    className={clsx(
                      "group flex items-center gap-2.5 text-[13px] mx-2 mb-px rounded-[7px] border",
                      isCollapsed ? "justify-center px-0 py-2" : "px-2.5 py-[5.5px]",
                      active
                        ? "bg-white text-charcoal font-medium border-[var(--hairline)] shadow-[0_1px_1px_rgba(20,20,20,0.03)]"
                        : "text-[var(--ink-muted)] border-transparent hover:text-charcoal hover:bg-black/[0.035]",
                    )}
                  >
                    <Icon
                      size={16}
                      strokeWidth={active ? 2.1 : 1.75}
                      className={clsx(
                        "shrink-0",
                        active
                          ? "text-tronic-red"
                          : "text-[var(--ink-faint)] group-hover:text-[var(--ink-muted)]",
                      )}
                    />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className={clsx(
          "border-t border-[var(--hairline)] hidden lg:flex items-center gap-2 text-[var(--ink-faint)] hover:text-charcoal text-xs py-2.5",
          isCollapsed ? "justify-center" : "px-4",
        )}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {hydrated &&
          (isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />)}
        {!isCollapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
