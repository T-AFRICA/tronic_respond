"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ImageOff, Loader2 } from "lucide-react";

type ProductHit = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  visibility: string;
  availability: string | null;
  category: string | null;
  image: string | null;
  price: { amount: number; currency: string } | null;
  offer: { price: number; discount: number | null } | null;
};

const money = (n: number, c: string) =>
  `${c} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Live product search with keyboard navigation and a hover detail preview.
 * Renders a plain <input name="q"> so it drops into existing GET forms —
 * the surrounding form still handles "all results" on submit.
 */
export function ProductSearchBox({
  scope = "admin",
  placeholder,
  inputClassName,
  className,
  defaultValue,
  linkParams,
}: {
  scope?: "admin" | "catalog";
  placeholder?: string;
  inputClassName?: string;
  className?: string;
  defaultValue?: string;
  /** Extra params (e.g. lang, t) appended to catalog product links. */
  linkParams?: Record<string, string | undefined>;
}) {
  const [q, setQ] = useState(defaultValue ?? "");
  const [items, setItems] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setItems([]);
      setOpen(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/products?scope=${scope}&q=${encodeURIComponent(term)}`,
        );
        const json = await res.json();
        if (seq.current === id) {
          setItems(json.items ?? []);
          setOpen(true);
          setActive(0);
          setKeyboardNav(false);
        }
      } catch {
        /* network hiccup — keep previous results */
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [q, scope]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hrefOf = (it: ProductHit) => {
    if (scope === "catalog") {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(linkParams ?? {})) {
        if (v) params.set(k, v);
      }
      const qs = params.toString();
      return `/catalog/p/${encodeURIComponent(it.sku)}${qs ? `?${qs}` : ""}`;
    }
    return `/dashboard/products/${it.id}`;
  };

  const go = (it: ProductHit) => {
    setOpen(false);
    router.push(hrefOf(it));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setKeyboardNav(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setKeyboardNav(true);
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      if (keyboardNav && items[active]) {
        e.preventDefault();
        go(items[active]);
      }
      // otherwise the surrounding form submits → full results page
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const current = items[active];

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <Search
        size={15}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] pointer-events-none z-[1]"
      />
      {loading && (
        <Loader2
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] animate-spin pointer-events-none z-[1]"
        />
      )}
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-[min(680px,calc(100vw-24px))] bg-white border border-[var(--hairline)] rounded-[10px] shadow-[0_12px_32px_rgba(26,26,29,0.14),0_2px_8px_rgba(26,26,29,0.08)] z-50 overflow-hidden">
          {items.length === 0 ? (
            <p className="px-4 py-3.5 text-[13px] text-[var(--ink-muted)]">
              No products match “{q.trim()}”.
            </p>
          ) : (
            <div className="flex">
              {/* Result list */}
              <ul className="w-full sm:w-[300px] max-h-[360px] overflow-y-auto py-1">
                {items.map((it, i) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onMouseEnter={() => {
                        setActive(i);
                        setKeyboardNav(false);
                      }}
                      onClick={() => go(it)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2.5 ${
                        i === active ? "bg-[var(--surface-canvas)]" : ""
                      }`}
                    >
                      <span className="w-9 h-9 rounded-[6px] bg-neutral-bg border border-[var(--hairline)] flex items-center justify-center overflow-hidden shrink-0">
                        {it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image}
                            alt=""
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <ImageOff size={14} className="text-[var(--ink-faint)]" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] leading-snug truncate">
                          {it.name}
                        </span>
                        <span className="block text-[11px] font-mono text-[var(--ink-muted)]">
                          {it.sku}
                          {it.offer && (
                            <span className="ml-1.5 font-sans text-tronic-red font-semibold">
                              {money(it.offer.price, it.price?.currency ?? "TZS")}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Detail preview (hovered / arrow-selected item) */}
              <div className="hidden sm:block flex-1 border-l border-[var(--hairline)] p-4 min-w-0">
                {current && (
                  <>
                    <div className="h-36 rounded-[8px] bg-neutral-bg border border-[var(--hairline)] flex items-center justify-center overflow-hidden mb-3">
                      {current.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={current.image}
                          alt={current.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <ImageOff size={22} className="text-[var(--ink-faint)]" />
                      )}
                    </div>
                    <p className="text-[13.5px] font-semibold leading-snug">
                      {current.name}
                    </p>
                    <p className="text-[11.5px] font-mono text-[var(--ink-muted)] mt-0.5">
                      {current.sku}
                    </p>
                    <p className="text-[12px] text-[var(--ink-muted)] mt-1">
                      {[current.brand, current.category]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
                      {current.offer ? (
                        <>
                          <span className="text-[15px] font-bold text-tronic-red">
                            {money(
                              current.offer.price,
                              current.price?.currency ?? "TZS",
                            )}
                          </span>
                          {current.price &&
                            Number(current.price.amount) > current.offer.price && (
                              <span className="text-[12px] text-[var(--ink-faint)] line-through">
                                {money(current.price.amount, current.price.currency)}
                              </span>
                            )}
                          <span className="text-[10.5px] font-semibold text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded-full px-2 py-0.5">
                            offer
                          </span>
                        </>
                      ) : current.price ? (
                        <span className="text-[15px] font-bold">
                          {money(current.price.amount, current.price.currency)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--ink-faint)]">
                          No retail price set
                        </span>
                      )}
                    </div>
                    {scope === "admin" && (
                      <p className="text-[11px] text-[var(--ink-muted)] mt-2 capitalize">
                        {current.visibility}
                        {current.availability
                          ? ` · ${current.availability.replace(/_/g, " ")}`
                          : ""}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="border-t border-[var(--hairline)] px-3 py-1.5 text-[11px] text-[var(--ink-faint)] flex justify-between">
              <span>↑↓ navigate · Enter opens</span>
              <span>Submit for all results</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
