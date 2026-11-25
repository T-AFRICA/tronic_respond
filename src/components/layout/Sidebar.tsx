"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type NavItem = {
  label: string;
  href: string;
  permission: string | null; // null = visible to all staff
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "",
    items: [{ label: "Overview", href: "/dashboard", permission: null }],
  },
  {
    section: "Catalog",
    items: [
      { label: "Products", href: "/dashboard/products", permission: "products.read" },
      { label: "Categories", href: "/dashboard/categories", permission: "products.read" },
      { label: "Offers", href: "/dashboard/offers", permission: "offers.read" },
      { label: "Meta Catalog", href: "/dashboard/meta-catalog", permission: "products.read" },
    ],
  },
  {
    section: "Customers",
    items: [
      { label: "Customers", href: "/dashboard/customers", permission: "customers.read" },
      { label: "Product Sharing", href: "/dashboard/sharing", permission: "sharing.send" },
      { label: "Broadcasting", href: "/dashboard/broadcasting", permission: "campaigns.read" },
      { label: "Message History", href: "/dashboard/message-history", permission: "customers.read" },
    ],
  },
  {
    section: "Sales",
    items: [
      { label: "Quotation Requests", href: "/dashboard/rfqs", permission: "rfqs.read" },
      { label: "Quotations", href: "/dashboard/quotations", permission: "quotations.read" },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Staff Management", href: "/dashboard/staff", permission: "staff.manage" },
      { label: "Reports", href: "/dashboard/reports", permission: "reports.read" },
      { label: "Integrations", href: "/dashboard/integrations", permission: "integrations.manage" },
      { label: "Audit Logs", href: "/dashboard/audit-logs", permission: "audit.read" },
      { label: "Settings", href: "/dashboard/settings", permission: "settings.manage" },
    ],
  },
];

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-charcoal text-white flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/dashboard" className="flex items-baseline gap-1">
          <span className="display font-black text-tronic-red text-xl">
            TRONIC
          </span>
          <span className="font-light text-white text-xl">Response</span>
        </Link>
        <p className="text-[11px] text-white/50 mt-1">
          Faster Responses. Smarter Sales.
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map(({ section, items }) => {
          const visible = items.filter(
            (i) => i.permission === null || permissions.includes(i.permission),
          );
          if (visible.length === 0) return null;
          return (
            <div key={section || "root"} className="mb-1">
              {section && (
                <p className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest text-white/40 font-semibold">
                  {section}
                </p>
              )}
              {visible.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "block px-5 py-2 text-sm transition-colors border-l-2",
                      active
                        ? "bg-white/10 border-tronic-red text-white font-medium"
                        : "border-transparent text-white/70 hover:text-white hover:bg-white/5",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
