import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assignRfq, setRfqStatus, createQuotationFromRfq } from "../actions";

export const metadata = { title: "Quotation Request" };
export const dynamic = "force-dynamic";

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requirePermission("rfqs.read");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: rfq }, { data: staff }] = await Promise.all([
    supabase
      .from("rfqs")
      .select(
        "*, rfq_items(*), customers(id, full_name, whatsapp_phone, company_name), profiles!rfqs_assigned_staff_id_fkey(id, full_name)",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("profiles")
      .select("id, full_name, roles!inner(key)")
      .eq("is_active", true)
      .in("roles.key", ["sales_staff", "sales_manager"]),
  ]);

  if (!rfq) notFound();

  const customer = Array.isArray(rfq.customers) ? rfq.customers[0] : rfq.customers;
  const assignee = Array.isArray(rfq.profiles) ? rfq.profiles[0] : rfq.profiles;
  const canAssign = hasPermission(profile, "rfqs.assign");
  const canQuote = hasPermission(profile, "quotations.write");
  const unmapped = (rfq.rfq_items ?? []).filter(
    (i: { mapping_status: string }) => i.mapping_status === "unmapped",
  ).length;

  const boundAssign = assignRfq.bind(null, id);
  const boundStatus = setRfqStatus.bind(null, id);
  const boundQuote = createQuotationFromRfq.bind(null, id);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-2xl font-black">{rfq.reference}</h1>
          <p className="text-sm text-charcoal-light mt-1 capitalize">
            {rfq.source.replace(/_/g, " ")} · {rfq.status.replace("_", " ")} ·{" "}
            {new Date(rfq.submitted_at).toLocaleString()}
          </p>
        </div>
        {canQuote && rfq.status !== "cancelled" && (
          <form action={boundQuote}>
            <button
              type="submit"
              className="bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 text-sm"
            >
              Create Quotation
            </button>
          </form>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Customer
          </h2>
          <p className="text-sm font-medium">
            {customer?.full_name || "Unknown"}
          </p>
          <p className="text-sm text-charcoal-light">{customer?.company_name}</p>
          <p className="text-sm font-mono mt-1">{customer?.whatsapp_phone}</p>
        </div>

        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Assignment
          </h2>
          <p className="text-sm mb-2">
            {assignee ? assignee.full_name : "Unassigned"}
          </p>
          {canAssign && (
            <form action={boundAssign} className="flex gap-2">
              <select
                name="staff_id"
                className="flex-1 rounded border border-neutral-border px-2 py-1.5 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Select staff…
                </option>
                {(staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="text-sm border border-neutral-border rounded px-3 py-1.5 hover:border-charcoal-light"
              >
                Assign
              </button>
            </form>
          )}
        </div>

        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Customer notes
          </h2>
          <p className="text-sm whitespace-pre-wrap">
            {rfq.customer_notes || "—"}
          </p>
          <form action={boundStatus} className="mt-3 flex gap-2">
            <select
              name="status"
              className="flex-1 rounded border border-neutral-border px-2 py-1.5 text-sm"
              defaultValue="under_review"
            >
              <option value="under_review">Under review</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              type="submit"
              className="text-sm border border-neutral-border rounded px-3 py-1.5 hover:border-charcoal-light"
            >
              Update
            </button>
          </form>
        </div>
      </div>

      {unmapped > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {unmapped} item(s) could not be matched to an internal SKU — review
          before quoting.
        </p>
      )}

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Mapping</th>
            </tr>
          </thead>
          <tbody>
            {(rfq.rfq_items ?? []).map(
              (item: {
                id: string;
                sku: string;
                product_name: string;
                quantity: number;
                mapping_status: string;
              }) => (
                <tr key={item.id}>
                  <td className="font-mono text-xs">{item.sku}</td>
                  <td>{item.product_name}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <span
                      className={`text-[11px] border rounded-full px-2 py-0.5 ${
                        item.mapping_status === "mapped"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-tronic-red-soft text-tronic-red border-tronic-red/30"
                      }`}
                    >
                      {item.mapping_status}
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
