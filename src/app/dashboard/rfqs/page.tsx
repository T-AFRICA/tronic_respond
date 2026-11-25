import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Quotation Requests" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  new: "bg-tronic-red-soft text-tronic-red border-tronic-red/30",
  assigned: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
  quoted: "bg-green-50 text-green-700 border-green-200",
  closed: "bg-neutral-bg text-charcoal-light border-neutral-border",
  cancelled: "bg-neutral-bg text-charcoal-light border-neutral-border",
};

export default async function RfqsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("rfqs.read");
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("rfqs")
    .select(
      "id, reference, status, source, submitted_at, customer_notes, customers(full_name, whatsapp_phone), profiles!rfqs_assigned_staff_id_fkey(full_name), rfq_items(id)",
    )
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);

  const { data: rfqs } = await query;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="display text-2xl font-black">Quotation Requests</h1>
          <p className="text-sm text-charcoal-light mt-1">
            WhatsApp cart submissions and manual requests. A request is never a
            confirmed purchase.
          </p>
        </div>
        <Link
          href="/dashboard/rfqs/new"
          className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-3 py-2"
        >
          Manual RFQ
        </Link>
      </div>

      <div className="flex gap-2 text-sm">
        {["", "new", "assigned", "under_review", "quoted", "closed"].map((s) => (
          <Link
            key={s || "all"}
            href={s ? `/dashboard/rfqs?status=${s}` : "/dashboard/rfqs"}
            className={`rounded-full border px-3 py-1 capitalize ${
              (status ?? "") === s
                ? "bg-charcoal text-white border-charcoal"
                : "bg-white border-neutral-border text-charcoal-light hover:border-charcoal-light"
            }`}
          >
            {s ? s.replace("_", " ") : "All"}
          </Link>
        ))}
      </div>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Source</th>
              <th>Status</th>
              <th>Assigned to</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {(rfqs ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-charcoal-light py-8">
                  No quotation requests yet.
                </td>
              </tr>
            )}
            {(rfqs ?? []).map((rfq) => {
              const customer = Array.isArray(rfq.customers)
                ? rfq.customers[0]
                : rfq.customers;
              const assignee = Array.isArray(rfq.profiles)
                ? rfq.profiles[0]
                : rfq.profiles;
              return (
                <tr key={rfq.id}>
                  <td>
                    <Link
                      href={`/dashboard/rfqs/${rfq.id}`}
                      className="text-tronic-red hover:underline font-medium"
                    >
                      {rfq.reference}
                    </Link>
                  </td>
                  <td>
                    {customer?.full_name || customer?.whatsapp_phone || "—"}
                  </td>
                  <td>{rfq.rfq_items?.length ?? 0}</td>
                  <td className="capitalize text-xs">
                    {rfq.source.replace(/_/g, " ")}
                  </td>
                  <td>
                    <span
                      className={`inline-block text-[11px] border rounded-full px-2 py-0.5 capitalize ${STATUS_BADGE[rfq.status] ?? ""}`}
                    >
                      {rfq.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>{assignee?.full_name ?? "Unassigned"}</td>
                  <td className="text-xs text-charcoal-light">
                    {new Date(rfq.submitted_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
