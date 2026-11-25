import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Quotations" };
export const dynamic = "force-dynamic";

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("quotations.read");
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("quotations")
    .select(
      "id, reference, status, version, currency, grand_total, valid_until, created_at, customers(full_name, whatsapp_phone), profiles!quotations_prepared_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);

  const { data: quotations } = await query;

  const filters = [
    "",
    "under_review",
    "prepared",
    "approved",
    "sent",
    "accepted",
    "rejected",
    "revision_requested",
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="display text-2xl font-black">Quotations</h1>
        <p className="text-sm text-charcoal-light mt-1">
          An accepted quotation is a sales outcome — not a payment or
          completed sale.
        </p>
      </div>

      <div className="flex gap-2 text-sm flex-wrap">
        {filters.map((s) => (
          <Link
            key={s || "all"}
            href={s ? `/dashboard/quotations?status=${s}` : "/dashboard/quotations"}
            className={`rounded-full border px-3 py-1 capitalize ${
              (status ?? "") === s
                ? "bg-charcoal text-white border-charcoal"
                : "bg-white border-neutral-border text-charcoal-light hover:border-charcoal-light"
            }`}
          >
            {s ? s.replace(/_/g, " ") : "All"}
          </Link>
        ))}
      </div>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Version</th>
              <th>Total</th>
              <th>Valid until</th>
              <th>Prepared by</th>
            </tr>
          </thead>
          <tbody>
            {(quotations ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-charcoal-light py-8">
                  No quotations yet — create one from a quotation request.
                </td>
              </tr>
            )}
            {(quotations ?? []).map((q) => {
              const customer = Array.isArray(q.customers) ? q.customers[0] : q.customers;
              const preparer = Array.isArray(q.profiles) ? q.profiles[0] : q.profiles;
              return (
                <tr key={q.id}>
                  <td>
                    <Link
                      href={`/dashboard/quotations/${q.id}`}
                      className="text-tronic-red hover:underline font-medium"
                    >
                      {q.reference}
                    </Link>
                  </td>
                  <td>{customer?.full_name || customer?.whatsapp_phone || "—"}</td>
                  <td className="capitalize">{q.status.replace(/_/g, " ")}</td>
                  <td>v{q.version}</td>
                  <td>
                    {Number(q.grand_total).toLocaleString()} {q.currency}
                  </td>
                  <td className="text-xs">
                    {q.valid_until
                      ? new Date(q.valid_until).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>{preparer?.full_name ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
