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

export function Sidebar({ permissions }: { permissions: string[] }) {
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

  // Longest-prefix match so e.g. /dashboard/products/images highlights
  // "Product Images", not "Products".
  const allHrefs = NAV.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => (h === "/dashboard" ? pathname === h : pathname.startsWith(h)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside
      className={clsx(
        "shrink-0 bg-[#1d1d1f] text-white flex flex-col min-h-screen sticky top-0 max-h-screen transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      {/* Brand */}
      <div
        className={clsx(
          "border-b border-white/10 flex items-center",
          collapsed ? "px-0 py-4 justify-center" : "px-5 py-4",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 shrink-0 rounded-lg bg-tronic-red flex items-center justify-center display font-black text-white text-lg shadow-[0_2px_8px_rgba(214,0,28,0.4)]">
            T
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block leading-tight truncate">
                <span className="display font-black text-white text-[17px]">TRONIC</span>
                <span className="font-light text-white/90 text-[17px]"> Response</span>
              </span>
              <span className="block text-[10px] text-white/40 leading-tight truncate">
                Faster Responses. Smarter Sales.
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
                (collapsed ? (
                  <div className="mx-4 my-2 border-t border-white/10" />
                ) : (
                  <p className="px-5 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/35 font-semibold">
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
                    title={collapsed ? item.label : undefined}
                    className={clsx(
                      "group relative flex items-center gap-3 text-[13.5px] transition-colors",
                      collapsed ? "justify-center px-0 py-2.5 mx-2 rounded-lg" : "px-4 py-[7px] mx-2 rounded-lg",
                      active
                        ? "bg-white/[0.08] text-white font-medium"
                        : "text-white/60 hover:text-white hover:bg-white/[0.05]",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-tronic-red" />
                    )}
                    <Icon
                      size={17}
                      strokeWidth={active ? 2.2 : 1.8}
                      className={clsx("shrink-0", active ? "text-tronic-red" : "text-white/50 group-hover:text-white/80")}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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
          "border-t border-white/10 flex items-center gap-2 text-white/40 hover:text-white/80 text-xs transition-colors py-3",
          collapsed ? "justify-center" : "px-5",
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {hydrated &&
          (collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />)}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
