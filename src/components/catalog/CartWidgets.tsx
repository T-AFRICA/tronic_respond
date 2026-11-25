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
      className="relative inline-flex items-center gap-1.5 text-sm font-semibold bg-white text-tronic-red rounded px-3 py-1.5"
    >
      {label}
      {count > 0 && (
        <span className="bg-charcoal text-white text-[11px] rounded-full px-1.5 py-0.5 leading-none">
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
        className={`text-sm font-semibold rounded px-3 py-2 transition-colors ${
          added
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-tronic-red hover:bg-tronic-red-dark text-white"
        }`}
      >
        {added ? `✓ ${addedLabel}` : label}
      </button>
    </div>
  );
}
