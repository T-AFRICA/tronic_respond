import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TRONIC Product Catalog",
  description:
    "Browse TRONIC products and request a quotation — no registration required.",
};

/**
 * Public, mobile-first customer catalog. No authentication.
 * The header/nav lives in each page so the language + token params carry
 * through links.
 */
export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-neutral-bg">{children}</div>;
}
