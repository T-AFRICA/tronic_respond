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
        "shrink-0 bg-tronic-red text-white flex flex-col transition-[width,transform] duration-200",
        // Desktop: sticky column (collapsible). Mobile: off-canvas drawer.
        "fixed inset-y-0 left-0 z-40 h-dvh w-64 lg:sticky lg:top-0 lg:z-auto lg:h-auto lg:min-h-screen lg:max-h-screen lg:translate-x-0",
        mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        isCollapsed ? "lg:w-[72px]" : "lg:w-64",
      )}
    >
      {/* Brand */}
      <div
        className={clsx(
          "border-b border-white/20",
          isCollapsed ? "px-0 py-4 flex justify-center" : "px-4 py-4",
        )}
      >
        <Link href="/dashboard" className="block min-w-0">
          {isCollapsed ? (
            <span className="w-9 h-9 shrink-0 rounded-lg bg-white flex items-center justify-center display font-black text-tronic-red text-lg">
              T
            </span>
          ) : (
            <span className="block">
              <span className="flex items-center justify-center bg-white rounded-xl px-4 py-3 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/tronic-logo.webp"
                  alt="TRONIC"
                  className="h-8 w-auto"
                />
              </span>
              <span className="block mt-2.5 text-center leading-tight">
                <span className="text-[13px] font-semibold tracking-[0.35em] uppercase text-white">
                  Response
                </span>
                <span className="block text-[10px] text-white/70 mt-0.5">
                  Faster Responses. Smarter Sales.
                </span>
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll">
        {NAV.map(({ section, items }) => {
          const visible = items.filter(
            (i) => i.permission === null || permissions.includes(i.permission),
          );
          if (visible.length === 0) return null;
          return (
            <div key={section || "root"} className="mb-2">
              {section &&
                (isCollapsed ? (
                  <div className="mx-4 my-2 border-t border-white/25" />
                ) : (
                  <p className="px-5 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/70 font-semibold">
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
                      "group relative flex items-center gap-3 text-[13.5px] transition-colors",
                      isCollapsed ? "justify-center px-0 py-2.5 mx-2 rounded-lg" : "px-4 py-[7px] mx-2 rounded-lg",
                      active
                        ? "bg-white text-tronic-red font-semibold shadow-sm"
                        : "text-white/85 hover:text-white hover:bg-white/15",
                    )}
                  >
                    <Icon
                      size={17}
                      strokeWidth={active ? 2.2 : 1.8}
                      className={clsx("shrink-0", active ? "text-tronic-red" : "text-white/80 group-hover:text-white")}
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
          "border-t border-white/20 hidden lg:flex items-center gap-2 text-white/70 hover:text-white text-xs transition-colors py-3",
          isCollapsed ? "justify-center" : "px-5",
        )}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {hydrated &&
          (isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />)}
        {!isCollapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
