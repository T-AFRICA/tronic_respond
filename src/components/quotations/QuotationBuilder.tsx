"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeTotals,
  type QuotationLineInput,
} from "@/modules/quotations/service";
import {
  saveQuotation,
  lookupProductBySku,
} from "@/app/dashboard/quotations/[id]/actions";

type ProductHit = {
  id: string;
  sku: string;
  name: string;
  currency: string;
  retail_price: number;
  wholesale_price: number | null;
};

const cell =
  "w-full rounded border border-neutral-border px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-tronic-red/40";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuotationBuilder({
  quotationId,
  initialLines,
  initialCurrency,
  initialDelivery,
  initialValidUntil,
  initialTerms,
  initialNotes,
  canSeeWholesale,
}: {
  quotationId: string;
  initialLines: QuotationLineInput[];
  initialCurrency: string;
  initialDelivery: number;
  initialValidUntil: string | null;
  initialTerms: string;
  initialNotes: string;
  canSeeWholesale: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<QuotationLineInput[]>(initialLines);
  const [currency, setCurrency] = useState(initialCurrency);
  const [delivery, setDelivery] = useState(initialDelivery);
  const [validUntil, setValidUntil] = useState(initialValidUntil ?? "");
  const [terms, setTerms] = useState(initialTerms);
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();

  const totals = useMemo(
    () => computeTotals(lines, delivery),
    [lines, delivery],
  );

  const patchLine = (idx: number, patch: Partial<QuotationLineInput>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const runSearch = () => {
    startSearch(async () => {
      setMessage(null);
      const res = await lookupProductBySku(search);
      if (res.ok) {
        setHits(res.products);
      } else {
        setHits([]);
        setMessage({ ok: false, text: res.error });
      }
    });
  };

  const addProduct = (p: ProductHit) => {
    setLines((prev) => [
      ...prev,
      {
        product_id: p.id,
        sku: p.sku,
        product_name: p.name,
        quantity: 1,
        list_price: p.retail_price,
        price_type: "retail",
        unit_price: p.retail_price,
        discount_pct: 0,
        tax_pct: 0,
        availability_note: "",
      },
    ]);
    setHits([]);
    setSearch("");
  };

  const save = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await saveQuotation(quotationId, {
        lines,
        currency,
        delivery_charge: delivery,
        valid_until: validUntil || null,
        terms_conditions: terms,
        internal_notes: notes,
      });
      if (res.ok) {
        setMessage({ ok: true, text: "Quotation saved." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      {message && (
        <p
          className={`text-sm rounded px-3 py-2 border ${
            message.ok
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-tronic-red bg-tronic-red-soft border-tronic-red/20"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Add product */}
      <div className="bg-white border border-neutral-border rounded-lg p-4">
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="Add product — search SKU or name…"
            className="w-80 rounded border border-neutral-border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            className="text-sm border border-neutral-border rounded px-4 py-2 hover:border-charcoal-light disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {hits.length > 0 && (
          <ul className="mt-2 border border-neutral-border rounded divide-y divide-neutral-border">
            {hits.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-bg"
              >
                <span>
                  <span className="font-mono text-xs text-charcoal-light mr-2">
                    {p.sku}
                  </span>
                  {p.name}
                  <span className="text-charcoal-light ml-2">
                    {fmt(p.retail_price)} {p.currency}
                    {canSeeWholesale && p.wholesale_price !== null && (
                      <span className="ml-1 text-xs">
                        (WS {fmt(p.wholesale_price)})
                      </span>
                    )}
                  </span>
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
      </div>

      {/* Line items */}
      <div className="border border-neutral-border rounded-lg overflow-x-auto bg-white">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th className="w-20">Qty</th>
              <th className="w-28">Unit price</th>
              <th className="w-20">Disc %</th>
              <th className="w-20">Tax %</th>
              <th className="w-40">Availability note</th>
              <th className="w-28 text-right">Line total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-charcoal-light py-6">
                  No items — add products above.
                </td>
              </tr>
            )}
            {totals.lines.map((line, idx) => (
              <tr key={`${line.sku}-${idx}`}>
                <td className="font-mono text-xs">{line.sku}</td>
                <td className="text-sm">
                  {line.product_name}
                  {line.unit_price < line.list_price && (
                    <span className="block text-[10px] text-charcoal-light">
                      list {fmt(line.list_price)}
                    </span>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={line.quantity}
                    onChange={(e) =>
                      patchLine(idx, { quantity: Number(e.target.value) })
                    }
                    className={cell}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) =>
                      patchLine(idx, { unit_price: Number(e.target.value) })
                    }
                    className={cell}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={line.discount_pct}
                    onChange={(e) =>
                      patchLine(idx, { discount_pct: Number(e.target.value) })
                    }
                    className={cell}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={line.tax_pct}
                    onChange={(e) =>
                      patchLine(idx, { tax_pct: Number(e.target.value) })
                    }
                    className={cell}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={line.availability_note}
                    maxLength={300}
                    placeholder="e.g. 2-week lead time"
                    onChange={(e) =>
                      patchLine(idx, { availability_note: e.target.value })
                    }
                    className={cell}
                  />
                </td>
                <td className="text-right font-medium">{fmt(line.line_total)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    title="Remove line"
                    className="text-charcoal-light hover:text-tronic-red text-sm px-1"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Terms + totals */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-charcoal-light mb-1">
                Currency
              </label>
              <input
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className={cell}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal-light mb-1">
                Valid until
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className={cell}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">
              Terms &amp; conditions (printed on the PDF)
            </label>
            <textarea
              rows={4}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className={cell}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">
              Internal notes (never shown to the customer)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cell}
            />
          </div>
        </div>

        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-charcoal-light">Subtotal</dt>
              <dd>{fmt(totals.subtotal)} {currency}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-charcoal-light">Discounts</dt>
              <dd>−{fmt(totals.discount_total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-charcoal-light">Tax</dt>
              <dd>{fmt(totals.tax_total)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-charcoal-light">Delivery charge</dt>
              <dd className="w-32">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={delivery}
                  onChange={(e) => setDelivery(Number(e.target.value))}
                  className={`${cell} text-right`}
                />
              </dd>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-neutral-border pt-2">
              <dt>Grand total</dt>
              <dd className="text-tronic-red">
                {fmt(totals.grand_total)} {currency}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={save}
            disabled={pending || lines.length === 0}
            className="mt-4 w-full bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save Quotation"}
          </button>
        </div>
      </div>
    </div>
  );
}
