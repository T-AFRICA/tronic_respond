"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  searchShareProducts,
  searchShareCustomers,
  shareProducts,
} from "@/app/dashboard/sharing/actions";

type ProductHit = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  description: string;
  image_url: string | null;
  retail_price: number | null;
  currency: string;
};

type CustomerHit = {
  id: string;
  full_name: string;
  company_name: string;
  whatsapp_phone: string;
  respondio_contact_id: string | null;
};

const fmt = (n: number) => Number(n).toLocaleString();

export function ShareComposer() {
  const router = useRouter();
  const [productTerm, setProductTerm] = useState("");
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [selected, setSelected] = useState<ProductHit[]>([]);
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [kind, setKind] = useState<"image_description" | "catalog_link">(
    "image_description",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [searchingP, startSearchP] = useTransition();
  const [searchingC, startSearchC] = useTransition();
  const [sending, startSend] = useTransition();

  const findProducts = () =>
    startSearchP(async () => {
      setMessage(null);
      const res = await searchShareProducts(productTerm);
      if (res.ok) setProductHits(res.products);
      else {
        setProductHits([]);
        setMessage({ ok: false, text: res.error });
      }
    });

  const findCustomers = () =>
    startSearchC(async () => {
      setMessage(null);
      const res = await searchShareCustomers(customerTerm);
      if (res.ok) setCustomerHits(res.customers);
      else {
        setCustomerHits([]);
        setMessage({ ok: false, text: res.error });
      }
    });

  const addProduct = (p: ProductHit) => {
    if (selected.some((s) => s.id === p.id)) return;
    if (selected.length >= 10) {
      setMessage({ ok: false, text: "Maximum 10 products per share." });
      return;
    }
    setSelected((prev) => [...prev, p]);
    setProductHits([]);
    setProductTerm("");
  };

  const send = () =>
    startSend(async () => {
      setMessage(null);
      if (!customer || selected.length === 0) return;
      const res = await shareProducts({
        customer_id: customer.id,
        product_ids: selected.map((p) => p.id),
        share_kind: kind,
        note,
      });
      if (res.ok) {
        setMessage({
          ok: true,
          text: `Shared ${res.sent} product(s) with ${customer.full_name || customer.whatsapp_phone}.`,
        });
        setSelected([]);
        setNote("");
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });

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

      <div className="grid md:grid-cols-2 gap-4">
        {/* Product selection */}
        <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">1 · Select products</h2>
          <div className="flex gap-2">
            <input
              type="search"
              value={productTerm}
              onChange={(e) => setProductTerm(e.target.value)}
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
              disabled={searchingP}
              className="text-sm border border-neutral-border rounded px-3 py-2 hover:border-charcoal-light disabled:opacity-50"
            >
              {searchingP ? "…" : "Search"}
            </button>
          </div>

          {productHits.length > 0 && (
            <ul className="border border-neutral-border rounded divide-y divide-neutral-border max-h-56 overflow-y-auto">
              {productHits.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-neutral-bg"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-charcoal-light mr-1">
                      {p.sku}
                    </span>
                    {p.name}
                    {!p.image_url && (
                      <span className="text-[10px] text-amber-700 ml-1">(no image)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="text-xs bg-tronic-red text-white rounded px-2 py-1 hover:bg-tronic-red-dark shrink-0"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected.length > 0 && (
            <div>
              <p className="text-xs text-charcoal-light mb-1">
                Selected ({selected.length}/10)
              </p>
              <ul className="space-y-1">
                {selected.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-sm bg-neutral-bg rounded px-3 py-1.5"
                  >
                    <span>
                      <span className="font-mono text-xs text-charcoal-light mr-1">
                        {p.sku}
                      </span>
                      {p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => prev.filter((s) => s.id !== p.id))
                      }
                      className="text-charcoal-light hover:text-tronic-red px-1"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Customer + send */}
        <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">2 · Choose customer &amp; send</h2>
          {!customer ? (
            <>
              <div className="flex gap-2">
                <input
                  type="search"
                  value={customerTerm}
                  onChange={(e) => setCustomerTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      findCustomers();
                    }
                  }}
                  placeholder="Search customer name, company, phone…"
                  className="flex-1 rounded border border-neutral-border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={findCustomers}
                  disabled={searchingC}
                  className="text-sm border border-neutral-border rounded px-3 py-2 hover:border-charcoal-light disabled:opacity-50"
                >
                  {searchingC ? "…" : "Search"}
                </button>
              </div>
              {customerHits.length > 0 && (
                <ul className="border border-neutral-border rounded divide-y divide-neutral-border max-h-44 overflow-y-auto">
                  {customerHits.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-bg"
                    >
                      <span>
                        {c.full_name || c.whatsapp_phone}
                        {c.company_name && (
                          <span className="text-charcoal-light"> · {c.company_name}</span>
                        )}
                        {!c.respondio_contact_id && (
                          <span className="text-[10px] text-amber-700 ml-1">
                            (not linked to Respond.io)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomer(c)}
                        className="text-xs border border-neutral-border rounded px-2 py-1 hover:border-charcoal-light"
                      >
                        Select
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between bg-neutral-bg rounded px-3 py-2 text-sm">
              <span>
                <span className="font-medium">
                  {customer.full_name || customer.whatsapp_phone}
                </span>
                <span className="text-charcoal-light font-mono text-xs ml-2">
                  {customer.whatsapp_phone}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCustomer(null)}
                className="text-charcoal-light hover:text-tronic-red px-1"
              >
                ✕
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">
              Format
            </label>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={kind === "image_description"}
                  onChange={() => setKind("image_description")}
                />
                Product cards (image + details)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={kind === "catalog_link"}
                  onChange={() => setKind("catalog_link")}
                />
                Catalog link
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">
              Opening message (optional)
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Hello! Here are the products you asked about…"
              className="w-full rounded border border-neutral-border px-3 py-2 text-sm"
            />
          </div>

          {/* Preview */}
          {selected.length > 0 && (
            <div className="border border-neutral-border rounded p-3 bg-neutral-bg">
              <p className="text-[10px] uppercase tracking-wide text-charcoal-light font-semibold mb-1">
                Preview — what the customer receives
              </p>
              {kind === "image_description" ? (
                <p className="text-xs text-charcoal-light">
                  {note ? `"${note}" + ` : ""}
                  {selected.length} product card(s): image, name, brand, SKU,
                  retail price (marked subject to quotation) and description.
                </p>
              ) : (
                <p className="text-xs text-charcoal-light">
                  One message listing {selected.length} product(s) with a link
                  to the online catalog filtered to those SKUs.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={send}
            disabled={sending || !customer || selected.length === 0}
            className="w-full bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send via WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
