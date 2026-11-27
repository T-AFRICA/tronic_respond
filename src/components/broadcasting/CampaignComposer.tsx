"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCampaign,
  searchCampaignProducts,
} from "@/app/dashboard/broadcasting/actions";

type ProductHit = { id: string; sku: string; name: string; brand: string };
type Segment = { id: string; name: string };
export type TemplateOption = { name: string; body: string; isCatalog: boolean };

const field =
  "w-full rounded border border-neutral-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40";
const label = "block text-xs font-medium text-charcoal-light mb-1";

const TYPES = [
  { value: "single_product", label: "Single product" },
  { value: "multi_product", label: "Multi-product (max 30)" },
  { value: "full_catalog", label: "Full catalog" },
  { value: "promotional", label: "Promotional offer" },
  { value: "new_arrivals", label: "New arrivals" },
] as const;

export function CampaignComposer({
  segments,
  templates = [],
}: {
  segments: Segment[];
  templates?: TemplateOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("multi_product");
  const [templateName, setTemplateName] = useState("");
  const [body, setBody] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [selected, setSelected] = useState<ProductHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  const needsProducts = type !== "full_catalog";
  const maxProducts = type === "single_product" ? 1 : 30;

  const findProducts = () =>
    startSearch(async () => {
      setMessage(null);
      const res = await searchCampaignProducts(term);
      if (res.ok) setHits(res.products);
      else {
        setHits([]);
        setMessage(res.error);
      }
    });

  const addProduct = (p: ProductHit) => {
    if (selected.some((s) => s.id === p.id)) return;
    if (selected.length >= maxProducts) {
      setMessage(
        type === "single_product"
          ? "A single-product campaign holds exactly one product."
          : "Meta multi-product messages support at most 30 products.",
      );
      return;
    }
    setSelected((prev) => [...prev, p]);
    setHits([]);
    setTerm("");
  };

  const save = () =>
    startSave(async () => {
      setMessage(null);
      const res = await createCampaign({
        name,
        campaign_type: type,
        template_name: templateName,
        message_body: body,
        segment_id: segmentId || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        product_ids: needsProducts ? selected.map((p) => p.id) : [],
      });
      if (res.ok) {
        router.push(`/dashboard/broadcasting/${res.id}`);
      } else {
        setMessage(res.error);
      }
    });

  return (
    <div className="space-y-4 max-w-3xl">
      {message && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          {message}
        </p>
      )}

      <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Campaign name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={field} />
          </div>
          <div>
            <label className={label}>Type</label>
            <select
              value={type}
              onChange={(e) => {
                const v = e.target.value as typeof type;
                setType(v);
                if (v === "single_product") setSelected((prev) => prev.slice(0, 1));
              }}
              className={field}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Audience</label>
            <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className={field}>
              <option value="">All customers (opted-out are suppressed)</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  Segment: {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Schedule (optional)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label}>
            Approved WhatsApp template (required outside the 24h window)
          </label>
          {templates.length > 0 ? (
            <>
              <select
                value={templateName}
                onChange={(e) => {
                  const v = e.target.value;
                  setTemplateName(v);
                  const t = templates.find((x) => x.name === v);
                  if (t?.body && !body.trim()) setBody(t.body);
                }}
                className={field}
              >
                <option value="">— choose an approved template —</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                    {t.isCatalog ? "  (catalog — opens inside WhatsApp)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-charcoal-light mt-1">
                Live list of approved templates on your WhatsApp channel
                (Respond.io). Picking one fills the preview text below.
              </p>
            </>
          ) : (
            <>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. product_promo_nov"
                maxLength={200}
                className={field}
              />
              <p className="text-[11px] text-charcoal-light mt-1">
                Could not load the template list from Respond.io — type the
                exact approved template name.
              </p>
            </>
          )}
        </div>
        <div>
          <label className={label}>Message body / template preview text</label>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} className={field} />
        </div>
      </div>

      {needsProducts && (
        <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold">
            Products ({selected.length}/{maxProducts})
          </h2>
          <div className="flex gap-2">
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  findProducts();
                }
              }}
              placeholder="Search SKU, name, brand…"
              className="flex-1 rounded border border-neutral-border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={findProducts}
              disabled={searching}
              className="text-sm border border-neutral-border rounded px-3 py-2 hover:border-charcoal-light disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {hits.length > 0 && (
            <ul className="border border-neutral-border rounded divide-y divide-neutral-border max-h-48 overflow-y-auto">
              {hits.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-bg">
                  <span>
                    <span className="font-mono text-xs text-charcoal-light mr-1">{p.sku}</span>
                    {p.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="text-xs bg-tronic-red text-white rounded px-2 py-1 hover:bg-tronic-red-dark"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <ul className="space-y-1">
              {selected.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm bg-neutral-bg rounded px-3 py-1.5">
                  <span>
                    <span className="font-mono text-xs text-charcoal-light mr-1">{p.sku}</span>
                    {p.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected((prev) => prev.filter((s) => s.id !== p.id))}
                    className="text-charcoal-light hover:text-tronic-red px-1"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || !name.trim()}
        className="bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-5 py-2 text-sm disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create Draft Campaign"}
      </button>
    </div>
  );
}
