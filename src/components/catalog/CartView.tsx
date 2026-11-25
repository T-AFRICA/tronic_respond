"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  readCart,
  setQty,
  removeFromCart,
  clearCart,
  onCartChange,
  type CartItem,
} from "@/components/catalog/cart-store";
import { submitCatalogRfq } from "@/app/catalog/actions";
import type { CatalogDict } from "@/lib/catalog/i18n";

const field =
  "w-full rounded border border-neutral-border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40";

export function CartView({
  dict,
  catalogHref,
  token,
}: {
  dict: CatalogDict;
  catalogHref: string;
  token?: string;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<
    | { kind: "sent"; reference: string }
    | { kind: "error"; text: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const update = () => setItems(readCart());
    update();
    setHydrated(true);
    return onCartChange(update);
  }, []);

  const submit = () =>
    startTransition(async () => {
      setResult(null);
      const res = await submitCatalogRfq({
        name,
        phone,
        company,
        notes,
        token,
        website: "",
        items: items.map((i) => ({ sku: i.sku, qty: i.qty })),
      });
      if (res.ok) {
        clearCart();
        setResult({ kind: "sent", reference: res.reference });
      } else {
        setResult({
          kind: "error",
          text: res.error === "phone" ? dict.phone_invalid : dict.request_error,
        });
      }
    });

  if (!hydrated) return null;

  if (result?.kind === "sent") {
    return (
      <div className="bg-white border border-green-200 rounded-lg p-6 text-center space-y-3">
        <p className="text-3xl">✅</p>
        <p className="text-sm">{dict.request_sent}</p>
        <p className="text-sm font-mono font-bold">{result.reference}</p>
        <Link
          href={catalogHref}
          className="inline-block text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
        >
          {dict.browse_catalog}
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-neutral-border rounded-lg p-6 text-center space-y-3">
        <p className="text-sm text-charcoal-light">{dict.cart_empty}</p>
        <Link
          href={catalogHref}
          className="inline-block text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
        >
          {dict.browse_catalog}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Items */}
      <ul className="bg-white border border-neutral-border rounded-lg divide-y divide-neutral-border">
        {items.map((item) => (
          <li key={item.sku} className="flex items-center gap-3 p-3">
            <div className="w-14 h-14 bg-neutral-bg rounded flex items-center justify-center overflow-hidden shrink-0">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="display font-black text-neutral-border">T</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug line-clamp-2">
                {item.name}
              </p>
              <p className="text-[11px] text-charcoal-light font-mono">
                {item.sku}
              </p>
              {item.price !== null && (
                <p className="text-xs font-semibold text-tronic-red">
                  {item.price.toLocaleString()} {item.currency}
                </p>
              )}
            </div>
            <input
              type="number"
              min={1}
              value={item.qty}
              onChange={(e) =>
                setQty(item.sku, Math.max(1, Number(e.target.value) || 1))
              }
              aria-label={dict.quantity}
              className="w-16 rounded border border-neutral-border px-2 py-1.5 text-sm shrink-0"
            />
            <button
              type="button"
              onClick={() => removeFromCart(item.sku)}
              aria-label={dict.remove}
              className="text-charcoal-light hover:text-tronic-red px-1 shrink-0"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* Contact form */}
      <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">{dict.your_details}</h2>
        {result?.kind === "error" && (
          <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
            {result.text}
          </p>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={dict.your_name}
          maxLength={120}
          className={field}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={dict.your_phone}
          inputMode="tel"
          maxLength={20}
          className={field}
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={dict.your_company}
          maxLength={160}
          className={field}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={dict.notes}
          rows={2}
          maxLength={1000}
          className={field}
        />
        {/* Honeypot — hidden from humans */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim().length < 2 || phone.trim().length < 7}
          className="w-full bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-3 text-sm disabled:opacity-50"
        >
          {pending ? dict.submitting : dict.submit_request}
        </button>
        <p className="text-[11px] text-charcoal-light text-center">
          {dict.price_note}.
        </p>
      </div>
    </div>
  );
}
