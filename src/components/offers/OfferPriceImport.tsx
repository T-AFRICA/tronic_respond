"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importOfferPricesFile } from "@/app/dashboard/offers/actions";

export function OfferPriceImport({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function onSubmit(formData: FormData) {
    setResult(null);
    setErrors([]);
    startTransition(async () => {
      const res = await importOfferPricesFile(offerId, formData);
      if (!res.ok) {
        setResult(res.error);
        return;
      }
      setResult(
        `Updated ${res.updated} price(s).` +
          (res.notInOffer ? ` ${res.notInOffer} SKU(s) are not part of this offer.` : "") +
          (res.totalErrors ? ` ${res.totalErrors} row error(s).` : ""),
      );
      setErrors(res.errors);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-2">
      <p className="text-xs text-charcoal-light">
        Import offer prices from Excel/CSV — columns <code>sku</code>,{" "}
        <code>offer_price</code> (optional <code>reference_price</code>).
        Imported prices reset verification.
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,.csv"
          required
          className="text-sm"
        />
        <button
          disabled={pending}
          className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import prices"}
        </button>
      </div>
      {result && <p className="text-xs text-charcoal">{result}</p>}
      {errors.length > 0 && (
        <ul className="text-xs text-tronic-red list-disc pl-4 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
