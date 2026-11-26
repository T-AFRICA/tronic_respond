"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, User, Ban } from "lucide-react";

type CustomerHit = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  whatsapp_phone: string | null;
  is_blocked: boolean | null;
  last_contact_at: string | null;
};

/** Live customer search — list left, detail preview right. */
export function CustomerSearchBox({
  placeholder,
  inputClassName,
  className,
  defaultValue,
  submitPath = "/dashboard/customers",
}: {
  placeholder?: string;
  inputClassName?: string;
  className?: string;
  defaultValue?: string;
  submitPath?: string;
}) {
  const [q, setQ] = useState(defaultValue ?? "");
  const [items, setItems] = useState<CustomerHit[]>([]);
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
          `/api/search/customers?q=${encodeURIComponent(term)}`,
        );
        const json = await res.json();
        if (seq.current === id) {
          setItems(json.items ?? []);
          setOpen(true);
          setActive(0);
          setKeyboardNav(false);
        }
      } catch {
        /* keep previous results */
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (it: CustomerHit) => {
    setOpen(false);
    const term = it.whatsapp_phone ?? it.full_name ?? "";
    router.push(`${submitPath}?q=${encodeURIComponent(term)}`);
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
        <div className="absolute left-0 top-full mt-1.5 w-[min(620px,calc(100vw-24px))] bg-white border border-[var(--hairline)] rounded-[10px] shadow-[0_12px_32px_rgba(26,26,29,0.14),0_2px_8px_rgba(26,26,29,0.08)] z-50 overflow-hidden">
          {items.length === 0 ? (
            <p className="px-4 py-3.5 text-[13px] text-[var(--ink-muted)]">
              No customers match “{q.trim()}”.
            </p>
          ) : (
            <div className="flex">
              <ul className="w-full sm:w-[280px] max-h-[340px] overflow-y-auto py-1">
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
                      <span className="w-8 h-8 rounded-full bg-neutral-bg border border-[var(--hairline)] flex items-center justify-center shrink-0 text-[var(--ink-muted)]">
                        <User size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] leading-snug truncate">
                          {it.full_name ?? it.whatsapp_phone ?? "Unknown"}
                          {it.is_blocked && (
                            <Ban
                              size={11}
                              className="inline ml-1.5 text-tronic-red"
                            />
                          )}
                        </span>
                        <span className="block text-[11px] font-mono text-[var(--ink-muted)] truncate">
                          {it.whatsapp_phone ?? "—"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="hidden sm:block flex-1 border-l border-[var(--hairline)] p-4 min-w-0">
                {current && (
                  <>
                    <p className="text-[13.5px] font-semibold leading-snug">
                      {current.full_name ?? "Unknown"}
                    </p>
                    {current.company_name && (
                      <p className="text-[12px] text-[var(--ink-muted)] mt-0.5">
                        {current.company_name}
                      </p>
                    )}
                    <p className="text-[12px] font-mono mt-2">
                      {current.whatsapp_phone ?? "—"}
                    </p>
                    <p className="text-[11.5px] text-[var(--ink-muted)] mt-2">
                      Last contact:{" "}
                      {current.last_contact_at
                        ? new Date(current.last_contact_at).toLocaleDateString()
                        : "—"}
                    </p>
                    {current.is_blocked ? (
                      <span className="inline-block mt-2.5 text-[10.5px] font-semibold text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded-full px-2 py-0.5">
                        Blocked — excluded from broadcasts
                      </span>
                    ) : (
                      <span className="inline-block mt-2.5 text-[10.5px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        Reachable
                      </span>
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
