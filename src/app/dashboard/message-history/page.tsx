import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Message History" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  read: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-tronic-red-soft text-tronic-red border-tronic-red/30",
  unknown: "bg-neutral-bg text-charcoal-light border-neutral-border",
};

export default async function MessageHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    direction?: string;
    status?: string;
    page?: string;
  }>;
}) {
  await requirePermission("customers.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("message_logs")
    .select(
      "id, direction, kind, status, body_preview, occurred_at, respondio_message_id, customers(name, phone), campaigns(name), sender:profiles!message_logs_sent_by_fkey(full_name)",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (sp.direction === "inbound" || sp.direction === "outbound") {
    query = query.eq("direction", sp.direction);
  }
  if (sp.status && ["queued", "sent", "delivered", "read", "failed", "unknown"].includes(sp.status)) {
    query = query.eq("status", sp.status);
  }
  if (sp.q) query = query.ilike("body_preview", `%${sp.q.trim()}%`);

  const { data: logs, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.direction) params.set("direction", sp.direction);
    if (sp.status) params.set("status", sp.status);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="display text-2xl font-black">Message History</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Every WhatsApp message the system knows about — sends, deliveries and
          relevant inbound messages. Delivery/read statuses only appear where
          the provider reports them.
        </p>
      </div>

      <form action="/dashboard/message-history" className="flex gap-2 flex-wrap">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search message preview…"
          className="flex-1 min-w-48 rounded border border-neutral-border bg-white px-3 py-2 text-sm"
        />
        <select
          name="direction"
          defaultValue={sp.direction ?? ""}
          className="rounded border border-neutral-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All directions</option>
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded border border-neutral-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {["queued", "sent", "delivered", "read", "failed", "unknown"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="bg-charcoal text-white text-sm font-semibold rounded px-4 py-2">
          Filter
        </button>
      </form>

      <p className="text-xs text-charcoal-light">
        {(count ?? 0).toLocaleString()} messages
      </p>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Dir</th>
              <th>Kind</th>
              <th>Customer</th>
              <th>Preview</th>
              <th>Campaign</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-charcoal-light py-6">
                  No messages recorded yet.
                </td>
              </tr>
            )}
            {(logs ?? []).map((m) => {
              const customer = Array.isArray(m.customers) ? m.customers[0] : m.customers;
              const campaign = Array.isArray(m.campaigns) ? m.campaigns[0] : m.campaigns;
              return (
                <tr key={m.id}>
                  <td className="text-xs text-charcoal-light whitespace-nowrap">
                    {new Date(m.occurred_at).toLocaleString()}
                  </td>
                  <td>
                    <span className="text-xs">
                      {m.direction === "outbound" ? "→ out" : "← in"}
                    </span>
                  </td>
                  <td className="text-xs capitalize">{m.kind}</td>
                  <td className="text-sm">
                    {customer ? (
                      <>
                        {customer.name}
                        <span className="text-xs text-charcoal-light block">
                          {customer.phone}
                        </span>
                      </>
                    ) : (
                      <span className="text-charcoal-light">—</span>
                    )}
                  </td>
                  <td className="text-xs max-w-72 truncate" title={m.body_preview}>
                    {m.body_preview || "—"}
                  </td>
                  <td className="text-xs">{campaign?.name ?? "—"}</td>
                  <td>
                    <span
                      className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_STYLE[m.status] ?? ""}`}
                    >
                      {m.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/dashboard/message-history${qs(page - 1)}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              ←
            </Link>
          )}
          <span className="text-charcoal-light">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard/message-history${qs(page + 1)}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
