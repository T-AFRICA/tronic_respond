"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  addToCart,
  readCart,
  onCartChange,
} from "@/components/catalog/cart-store";

/** Cart link with live item count (header). */
export function CartBadge({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () =>
      setCount(readCart().reduce((acc, i) => acc + i.qty, 0));
    update();
    return onCartChange(update);
  }, []);

  return (
    <Link
      href={href}
      className="relative inline-flex items-center gap-1.5 text-xs font-bold bg-charcoal text-white rounded-full pl-3 pr-3.5 py-2 shadow-sm hover:bg-black transition-colors"
      title={label}
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-white text-tronic-red border border-tronic-red/30 text-[10px] font-black rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center leading-none shadow-sm">
          {count}
        </span>
      )}
    </Link>
  );
}

/** Add-to-selection button used on cards and the detail page. */
export function AddToCartButton({
  sku,
  name,
  price,
  currency,
  imageUrl,
  label,
  addedLabel,
  withQty = false,
  qtyLabel,
}: {
  sku: string;
  name: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  label: string;
  addedLabel: string;
  withQty?: boolean;
  qtyLabel?: string;
}) {
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const update = () => setAdded(readCart().some((i) => i.sku === sku));
    update();
    return onCartChange(update);
  }, [sku]);

  return (
    <div className="flex items-center gap-2">
      {withQty && (
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-charcoal-light">{qtyLabel}</span>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded border border-neutral-border px-2 py-1.5 text-sm"
          />
        </label>
      )}
      <button
        type="button"
        onClick={() =>
          addToCart({ sku, name, price, currency, image_url: imageUrl }, qty)
        }
        className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 transition-all ${
          added
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-tronic-red hover:bg-tronic-red-dark text-white shadow-sm hover:shadow"
        }`}
      >
        {added ? `✓ ${addedLabel}` : label}
      </button>
    </div>
  );
}
