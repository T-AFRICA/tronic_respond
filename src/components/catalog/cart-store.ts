"use client";

/**
 * Client-side cart for the public catalog (no registration required).
 * Persisted in localStorage; a custom event keeps the badge in sync.
 */

export type CartItem = {
  sku: string;
  name: string;
  price: number | null;
  currency: string;
  image_url: string | null;
  qty: number;
};

const KEY = "tronic-catalog-cart";
const EVENT = "tronic-cart-changed";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function addToCart(item: Omit<CartItem, "qty">, qty = 1) {
  const items = readCart();
  const existing = items.find((i) => i.sku === item.sku);
  if (existing) existing.qty += qty;
  else items.push({ ...item, qty });
  write(items);
}

export function setQty(sku: string, qty: number) {
  const items = readCart()
    .map((i) => (i.sku === sku ? { ...i, qty } : i))
    .filter((i) => i.qty > 0);
  write(items);
}

export function removeFromCart(sku: string) {
  write(readCart().filter((i) => i.sku !== sku));
}

export function clearCart() {
  write([]);
}

export function onCartChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
