"use client";

import { useEffect, useRef, useState } from "react";
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
  UsersRound,
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
  description: string; // shown in the hover preview card
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "",
    items: [
      { label: "Overview", href: "/dashboard", permission: null, icon: LayoutDashboard,
        description: "Today's snapshot — campaigns, catalog health, quotations and recent WhatsApp activity." },
    ],
  },
  {
    section: "Catalog",
    items: [
      { label: "Products", href: "/dashboard/products", permission: "products.read", icon: Package,
        description: "All products with prices, offer badges, publish status and Meta catalog sync." },
      { label: "Product Images", href: "/dashboard/products/images", permission: "products.write", icon: ImageIcon,
        description: "Upload and manage product photos; see which products are still missing an image." },
      { label: "Categories", href: "/dashboard/categories", permission: "products.read", icon: FolderTree,
        description: "Organise products into categories for easier browsing and filtering." },
      { label: "Offers", href: "/dashboard/offers", permission: "offers.read", icon: BadgePercent,
        description: "Create discount offers (e.g. -50%) and choose which products they apply to." },
      { label: "Meta Catalog", href: "/dashboard/meta-catalog", permission: "products.read", icon: Store,
        description: "Sync status with the WhatsApp/Meta catalog — what customers see inside WhatsApp." },
    ],
  },
  {
    section: "Customers",
    items: [
      { label: "Customers", href: "/dashboard/customers", permission: "customers.read", icon: Users,
        description: "Customer directory — WhatsApp numbers, companies, tags and block status." },
      { label: "Segments", href: "/dashboard/segments", permission: "customers.read", icon: UsersRound,
        description: "Build target lists for campaigns — by activity filter, Excel upload or search." },
      { label: "Product Sharing", href: "/dashboard/sharing", permission: "sharing.send", icon: Share2,
        description: "Send product cards with photos and prices to a customer's WhatsApp chat." },
      { label: "Broadcasting", href: "/dashboard/broadcasting", permission: "campaigns.read", icon: Megaphone,
        description: "Create campaigns and send approved template broadcasts to whole segments." },
      { label: "Message History", href: "/dashboard/message-history", permission: "customers.read", icon: MessageSquareText,
        description: "Every inbound and outbound WhatsApp message the system has logged." },
    ],
  },
  {
    section: "Sales",
    items: [
      { label: "Quotation Requests", href: "/dashboard/rfqs", permission: "rfqs.read", icon: Inbox,
        description: "Incoming quotation requests from customers, ready to be picked up." },
      { label: "Quotations", href: "/dashboard/quotations", permission: "quotations.read", icon: FileText,
        description: "Create, send and track quotations and their statuses." },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Staff Management", href: "/dashboard/staff", permission: "staff.manage", icon: UserCog,
        description: "Invite staff accounts and control their roles and permissions." },
      { label: "Reports", href: "/dashboard/reports", permission: "reports.read", icon: BarChart3,
        description: "Performance reports — sales, campaigns and catalog statistics." },
      { label: "Integrations", href: "/dashboard/integrations", permission: "integrations.manage", icon: Plug,
        description: "Connection health for Respond.io, Meta and the worker queue." },
      { label: "Audit Logs", href: "/dashboard/audit-logs", permission: "audit.read", icon: ScrollText,
        description: "Full audit trail — who did what and when, across the whole system." },
      { label: "Settings", href: "/dashboard/settings", permission: "settings.manage", icon: Settings,
        description: "System settings — test allowlist, live broadcast switch and defaults." },
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
  // Hover live-preview: after a short hover-intent delay, the target page is
  // rendered in an iframe panel over the content area (desktop only). The
  // panel is fixed-positioned so the nav's scroll container can't clip it,
  // and pointer-events-none so it vanishes as soon as the mouse leaves the
  // sidebar item. Visited pages stay mounted (hidden) so re-hovering is
  // instant.
  const [preview, setPreview] = useState<{
    href: string;
    label: string;
    description: string;
    left: number;
  } | null>(null);
  const [warm, setWarm] = useState<string[]>([]);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, []);

  function queuePreview(item: NavItem, el: HTMLElement) {
    const left = el.getBoundingClientRect().right + 12;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      setWarm((w) => (w.includes(item.href) ? w : [...w, item.href]));
      setPreview({
        href: item.href,
        label: item.label,
        description: item.description,
        left,
      });
    }, 350);
  }

  function cancelPreview() {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreview(null);
  }

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
        "shrink-0 bg-[#1a1a1d] text-white flex flex-col transition-[width,transform] duration-200",
        // Desktop: sticky column (collapsible). Mobile: off-canvas drawer.
        "fixed inset-y-0 left-0 z-40 h-dvh w-[232px] lg:sticky lg:top-0 lg:z-auto lg:h-auto lg:min-h-screen lg:max-h-screen lg:translate-x-0",
        mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
        isCollapsed ? "lg:w-[64px]" : "lg:w-[232px]",
      )}
    >
      {/* Brand block — unmistakable TRONIC red with the white mark */}
      <div className="bg-tronic-red shrink-0">
        <Link
          href="/dashboard"
          className={clsx(
            "flex items-center",
            isCollapsed ? "justify-center h-14" : "px-5 h-[84px] gap-2.5",
          )}
        >
          {isCollapsed ? (
            <span className="display text-white text-xl font-black leading-none">T</span>
          ) : (
            <span className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/tronic-logo.webp"
                alt="TRONIC"
                className="h-9 w-auto brightness-0 invert"
              />
              <span className="block text-[11px] tracking-[0.32em] uppercase text-white/85 mt-1.5 font-medium">
                Response
              </span>
            </span>
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
                  <div className="mx-3 my-2 border-t border-white/10" />
                ) : (
                  <p className="px-4 pt-4 pb-1 text-[10.5px] uppercase tracking-[0.1em] text-white/45 font-semibold select-none">
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
                    onClick={() => {
                      cancelPreview();
                      onNavigate?.();
                    }}
                    onMouseEnter={(e) => queuePreview(item, e.currentTarget)}
                    onMouseLeave={cancelPreview}
                    className={clsx(
                      "group flex items-center gap-2.5 text-[13.5px] mx-2 mb-px rounded-[7px] border",
                      isCollapsed ? "justify-center px-0 py-2" : "px-3 py-[6.5px]",
                      active
                        ? "bg-white/[0.09] text-white font-semibold border-transparent relative"
                        : "text-white/80 border-transparent hover:text-white hover:bg-white/[0.05]",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r bg-tronic-red" />
                    )}
                    <Icon
                      size={16}
                      strokeWidth={active ? 2.1 : 1.75}
                      className={clsx(
                        "shrink-0",
                        active
                          ? "text-tronic-red"
                          : "text-white/60 group-hover:text-white/90",
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

      {/* Hover live-preview panel (desktop only) — shows the hovered page
          over the content area without clicking. */}
      {warm.length > 0 && (
        <div
          className={clsx(
            "hidden lg:block fixed z-50 pointer-events-none",
            !preview && "invisible",
          )}
          style={{
            top: 12,
            bottom: 12,
            left: preview?.left ?? 244,
            right: 12,
          }}
        >
          <div className="h-full rounded-xl border border-neutral-border bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-neutral-border bg-neutral-bg shrink-0 flex items-baseline gap-2 flex-wrap">
              <p className="text-sm font-semibold text-charcoal">
                {preview?.label}
              </p>
              <p className="text-xs text-charcoal-light">
                {preview?.description} · Click to open the page
              </p>
            </div>
            <div className="flex-1 relative overflow-hidden bg-white">
              <p className="absolute inset-0 flex items-center justify-center text-sm text-charcoal-light">
                Loading preview…
              </p>
              {warm.map((href) => (
                <iframe
                  key={href}
                  src={href}
                  title={`Preview of ${href}`}
                  className={clsx(
                    "absolute top-0 left-0 border-0",
                    preview?.href !== href && "hidden",
                  )}
                  style={{
                    width: "133.4%",
                    height: "133.4%",
                    transform: "scale(0.75)",
                    transformOrigin: "top left",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className={clsx(
          "border-t border-white/10 hidden lg:flex items-center gap-2 text-white/45 hover:text-white/85 text-xs py-2.5",
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
