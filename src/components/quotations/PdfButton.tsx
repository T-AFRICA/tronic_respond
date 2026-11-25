"use client";

import { useState, useTransition } from "react";
import { getPdfUrl } from "@/app/dashboard/quotations/[id]/actions";

export function PdfButton({ quotationId }: { quotationId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    startTransition(async () => {
      setError(null);
      const res = await getPdfUrl(quotationId);
      if (res.ok) {
        window.open(res.url, "_blank", "noopener");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light disabled:opacity-50"
      >
        {pending ? "Opening…" : "View PDF"}
      </button>
      {error && <span className="text-xs text-tronic-red">{error}</span>}
    </span>
  );
}
