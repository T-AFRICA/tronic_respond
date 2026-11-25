"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOffer, searchOfferProducts } from "@/app/dashboard/offers/actions";

type PickedProduct = {
  id: string;
  sku: string;
  name: string;
  retail_price: number | null;
  currency: string;
};

type Category = { id: string; name: string };

export function OfferForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingMode, setPricingMode] = useState<"percentage" | "fixed_price" | "individual">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [selectionMode, setSelectionMode] = useState<"products" | "category" | "all_published">("products");
  const [categoryId, setCategoryId] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [picked, setPicked] = useState<PickedProduct[]>([]);
  const [individualPrices, setIndividualPrices] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);

  async function runSearch() {
    setSearching(true);
    setError(null);
    const res = await searchOfferProducts(term);
    setSearching(false);
    if (!res.ok) {
      setResults([]);
      setError(res.error);
      return;
    }
    setResults(res.products);
  }

  function addProduct(p: PickedProduct) {
    setPicked((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createOffer({
        name,
        description,
        pricing_mode: pricingMode,
        discount_value:
          pricingMode === "individual" || discountValue === ""
            ? null
            : Number(discountValue),
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        selection_mode: selectionMode,
        product_ids: selectionMode === "products" ? picked.map((p) => p.id) : [],
        category_id: selectionMode === "category" ? categoryId || null : null,
        individual_prices:
          pricingMode === "individual"
            ? Object.fromEntries(
                Object.entries(individualPrices)
                  .map(([k, v]) => [k, Number(v)] as const)
                  .filter(([, v]) => v > 0),
              )
            : {},
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/dashboard/offers/${res.id}?created=1&added=${res.added}&skipped=${res.skipped}`);
    });
  }

  const input =
    "w-full rounded border border-neutral-border bg-white px-3 py-2 text-sm";
  const label = "block text-xs font-semibold text-charcoal-light mb-1";

  return (
    <div className="space-y-5 max-w-3xl">
      {error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold">
          1 · Offer details
        </h2>
        <div>
          <label className={label}>Offer name *</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. December Special Offers" />
        </div>
        <div>
          <label className={label}>Description</label>
          <textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Starts (optional — empty = immediately on activation)</label>
            <input type="datetime-local" className={input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className={label}>Ends (optional — auto-expires)</label>
            <input type="datetime-local" className={input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold">
          2 · Pricing
        </h2>
        <div className="flex gap-4 flex-wrap text-sm">
          {(
            [
              ["percentage", "Percentage discount"],
              ["fixed_price", "Fixed offer price"],
              ["individual", "Individual prices per product"],
            ] as const
          ).map(([mode, text]) => (
            <label key={mode} className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={pricingMode === mode}
                onChange={() => setPricingMode(mode)}
              />
              {text}
            </label>
          ))}
        </div>
        {pricingMode !== "individual" && (
          <div className="max-w-56">
            <label className={label}>
              {pricingMode === "percentage" ? "Discount % *" : "Offer price (TZS) *"}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={input}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>
        )}
        <p className="text-xs text-charcoal-light">
          Reference price = the product&apos;s current retail price. Every computed
          price must be verified by a manager before the offer can be activated.
        </p>
      </div>

      <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold">
          3 · Products
        </h2>
        <div className="flex gap-4 flex-wrap text-sm">
          {(
            [
              ["products", "Pick products"],
              ["category", "Whole category"],
              ["all_published", "All published products"],
            ] as const
          ).map(([mode, text]) => (
            <label key={mode} className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={selectionMode === mode}
                onChange={() => setSelectionMode(mode)}
              />
              {text}
            </label>
          ))}
        </div>

        {selectionMode === "category" && (
          <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {selectionMode === "products" && (
          <>
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="Search by SKU or name…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searching}
                className="shrink-0 text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-4 py-2 disabled:opacity-50"
              >
                {searching ? "…" : "Search"}
              </button>
            </div>
            {results.length > 0 && (
              <div className="border border-neutral-border rounded divide-y divide-neutral-border max-h-56 overflow-y-auto">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-bg flex justify-between gap-3"
                  >
                    <span>
                      <span className="font-mono text-xs text-charcoal-light mr-2">{p.sku}</span>
                      {p.name}
                    </span>
                    <span className="text-charcoal-light shrink-0">
                      {p.retail_price !== null
                        ? `${p.retail_price.toLocaleString()} ${p.currency}`
                        : "no retail price"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {picked.length > 0 && (
              <div className="border border-neutral-border rounded overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Retail</th>
                      {pricingMode === "individual" && <th>Offer price (TZS)</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {picked.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td>{p.name}</td>
                        <td>{p.retail_price !== null ? p.retail_price.toLocaleString() : "—"}</td>
                        {pricingMode === "individual" && (
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-32 rounded border border-neutral-border px-2 py-1 text-sm"
                              value={individualPrices[p.id] ?? ""}
                              onChange={(e) =>
                                setIndividualPrices((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                            />
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="text-xs text-tronic-red hover:underline"
                            onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {selectionMode !== "products" && pricingMode === "individual" && (
          <p className="text-xs text-tronic-red">
            Individual prices require picking products one by one (or import prices
            from Excel after creating the offer).
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim()}
          className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-5 py-2.5 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Draft Offer"}
        </button>
        <p className="text-xs text-charcoal-light">
          Created as a draft — prices are verified and the offer activated on the next screen.
        </p>
      </div>
    </div>
  );
}
