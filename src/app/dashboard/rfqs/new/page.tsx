import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createManualRfq } from "./actions";

export const metadata = { title: "Manual RFQ" };
export const dynamic = "force-dynamic";

export default async function NewRfqPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("rfqs.write");
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, full_name, whatsapp_phone, company_name")
    .order("full_name")
    .limit(500);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="display text-2xl font-black">Manual Quotation Request</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Fallback for requests received outside the native WhatsApp cart —
          phone calls, free-text messages, or unsupported payloads.
        </p>
      </div>

      {error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          Could not create the request. Check the item lines (format:
          SKU, quantity) and try again.
        </p>
      )}

      <form
        action={createManualRfq}
        className="bg-white border border-neutral-border rounded-lg p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-charcoal-light mb-1" htmlFor="customer_id">
            Customer *
          </label>
          <select
            id="customer_id"
            name="customer_id"
            required
            defaultValue=""
            className="w-full rounded border border-neutral-border px-3 py-2 text-sm bg-white"
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.whatsapp_phone}
                {c.company_name ? ` — ${c.company_name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal-light mb-1" htmlFor="items">
            Items * <span className="font-normal">(one per line: SKU, quantity)</span>
          </label>
          <textarea
            id="items"
            name="items"
            rows={6}
            required
            placeholder={"ABB-MCB-16A, 10\nSCH-CT-100A, 2"}
            className="w-full rounded border border-neutral-border px-3 py-2 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal-light mb-1" htmlFor="notes">
            Customer notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full rounded border border-neutral-border px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 text-sm"
        >
          Create Request
        </button>
      </form>
    </div>
  );
}
