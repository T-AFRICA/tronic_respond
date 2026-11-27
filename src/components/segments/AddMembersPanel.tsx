"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMembersByFilter,
  addMembersByPhones,
  addMemberById,
} from "@/app/dashboard/segments/actions";

type CustomerHit = {
  id: string;
  full_name: string;
  company_name: string;
  whatsapp_phone: string;
  is_blocked: boolean;
  last_contact_at: string | null;
};

const field =
  "rounded border border-neutral-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40";
const tabBase = "px-3 py-1.5 text-sm font-medium rounded-t border-b-2";

export function AddMembersPanel({ segmentId }: { segmentId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"filter" | "paste" | "search">("filter");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [busy, startWork] = useTransition();

  // --- Filter tab ---
  const [activeDays, setActiveDays] = useState("90");
  const [tag, setTag] = useState("");
  const [preview, setPreview] = useState<number | null>(null);

  // --- Paste tab ---
  const [pasted, setPasted] = useState("");

  // --- Search tab ---
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (tab !== "search") return;
    const q = term.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/customers?q=${encodeURIComponent(q)}`,
        );
        const body = (await res.json()) as { items: CustomerHit[] };
        if (seq.current === mySeq) setHits(body.items ?? []);
      } catch {
        /* network hiccup — keep previous results */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [term, tab]);

  const report = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const filterPayload = (countOnly: boolean) => ({
    segmentId,
    activeDays: Math.max(0, parseInt(activeDays, 10) || 0),
    tag: tag.trim(),
    countOnly,
  });

  const previewFilter = () =>
    startWork(async () => {
      setMessage(null);
      const res = await addMembersByFilter(filterPayload(true));
      if (res.ok) setPreview(res.matched);
      else report(res.error, true);
    });

  const applyFilter = () =>
    startWork(async () => {
      setMessage(null);
      const res = await addMembersByFilter(filterPayload(false));
      if (res.ok) {
        report(
          `${res.matched} customers matched — ${res.added} newly added (rest were already in the segment).`,
        );
        setPreview(null);
        router.refresh();
      } else report(res.error, true);
    });

  const applyPaste = () =>
    startWork(async () => {
      setMessage(null);
      const res = await addMembersByPhones({ segmentId, text: pasted });
      if (res.ok) {
        const parts = [
          `${res.parsed} numbers read`,
          `${res.matched} matched existing customers`,
          `${res.added} newly added`,
        ];
        if (res.notFoundTotal > 0) {
          parts.push(
            `${res.notFoundTotal} not in the customer list (sync from Respond.io first): ${res.notFound.join(", ")}${res.notFoundTotal > res.notFound.length ? "…" : ""}`,
          );
        }
        if (res.invalidTotal > 0) {
          parts.push(
            `${res.invalidTotal} unreadable: ${res.invalid.join(", ")}${res.invalidTotal > res.invalid.length ? "…" : ""}`,
          );
        }
        report(parts.join(". "));
        setPasted("");
        router.refresh();
      } else report(res.error, true);
    });

  const addOne = (c: CustomerHit) =>
    startWork(async () => {
      setMessage(null);
      const res = await addMemberById({ segmentId, customerId: c.id });
      if (res.ok) {
        report(
          res.added > 0
            ? `${c.full_name || c.whatsapp_phone} added.`
            : `${c.full_name || c.whatsapp_phone} is already in this segment.`,
        );
        router.refresh();
      } else report(res.error, true);
    });

  return (
    <div className="border border-neutral-border rounded-lg bg-white">
      <div className="flex gap-1 px-3 pt-2 border-b border-neutral-border">
        {(
          [
            ["filter", "By activity filter"],
            ["paste", "Paste phone numbers"],
            ["search", "Search & add"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setMessage(null);
            }}
            className={`${tabBase} ${
              tab === key
                ? "border-tronic-red text-tronic-red"
                : "border-transparent text-charcoal-light hover:text-charcoal"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {tab === "filter" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-charcoal-light mb-1">
                  Contacted within (days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={activeDays}
                  onChange={(e) => {
                    setActiveDays(e.target.value);
                    setPreview(null);
                  }}
                  className={`${field} w-32`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal-light mb-1">
                  Tag (optional)
                </label>
                <input
                  value={tag}
                  onChange={(e) => {
                    setTag(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="e.g. wholesale"
                  className={`${field} w-44`}
                />
              </div>
              <button
                type="button"
                onClick={previewFilter}
                disabled={busy}
                className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light disabled:opacity-50"
              >
                Preview count
              </button>
              <button
                type="button"
                onClick={applyFilter}
                disabled={busy}
                className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 disabled:opacity-50"
              >
                {busy ? "Working…" : "Add all matching"}
              </button>
            </div>
            <p className="text-xs text-charcoal-light">
              Matches customers with a conversation in the last N days (0 = all
              customers). Blocked customers are always excluded.
              {preview !== null && (
                <span className="ml-2 font-semibold text-charcoal">
                  {preview} customers match this filter.
                </span>
              )}
            </p>
          </div>
        )}

        {tab === "paste" && (
          <div className="space-y-3">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              placeholder={"One number per line (commas also work):\n+255712345678\n0712345678\n+60142539112"}
              className={`${field} w-full font-mono text-xs`}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={applyPaste}
                disabled={busy || !pasted.trim()}
                className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 disabled:opacity-50"
              >
                {busy ? "Matching…" : "Match & add"}
              </button>
              <p className="text-xs text-charcoal-light">
                Numbers starting with 0 are treated as Tanzanian (+255). Only
                numbers that already exist as customers are added.
              </p>
            </div>
          </div>
        )}

        {tab === "search" && (
          <div className="space-y-2">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Type a name, company, or phone…"
              className={`${field} w-full max-w-md`}
            />
            {hits.length > 0 && (
              <ul className="border border-neutral-border rounded divide-y divide-neutral-border max-w-xl">
                {hits.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {c.full_name || c.whatsapp_phone}
                        {c.is_blocked && (
                          <span className="ml-2 text-xs text-tronic-red">
                            Blocked
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-charcoal-light font-mono">
                        {c.whatsapp_phone}
                        {c.company_name ? ` · ${c.company_name}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addOne(c)}
                      disabled={busy}
                      className="text-xs border border-neutral-border rounded px-3 py-1.5 hover:border-tronic-red hover:text-tronic-red disabled:opacity-50 shrink-0"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {message && (
          <p
            className={`text-sm rounded px-3 py-2 border ${
              isError
                ? "text-tronic-red bg-tronic-red-soft border-tronic-red/20"
                : "text-green-700 bg-green-50 border-green-200"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
