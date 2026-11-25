import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateCustomer, setConsent } from "../actions";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

const field =
  "w-full rounded border border-neutral-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40";
const label = "block text-xs font-medium text-charcoal-light mb-1";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await requirePermission("customers.read");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: customer }, { data: staff }, { data: consents }, { data: messages }, { data: rfqs }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("current_customer_consents")
        .select("*")
        .eq("customer_id", id),
      supabase
        .from("message_logs")
        .select("id, direction, kind, status, body_preview, occurred_at")
        .eq("customer_id", id)
        .order("occurred_at", { ascending: false })
        .limit(15),
      supabase
        .from("rfqs")
        .select("id, reference, status, submitted_at")
        .eq("customer_id", id)
        .order("submitted_at", { ascending: false })
        .limit(10),
    ]);

  if (!customer) notFound();

  const canWrite = hasPermission(profile, "customers.write");
  const marketing = consents?.find((c) => c.channel === "whatsapp_marketing");
  const marketingStatus = marketing?.status ?? "unknown";

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="display text-2xl font-black">
          {customer.full_name || customer.whatsapp_phone}
        </h1>
        <p className="text-sm text-charcoal-light mt-1 font-mono">
          {customer.whatsapp_phone}
          {customer.respondio_contact_id
            ? ` · Respond.io #${customer.respondio_contact_id}`
            : " · not linked to Respond.io"}
        </p>
      </div>

      {sp.saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Customer saved.
        </p>
      )}
      {sp.error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          Save failed — check the fields and try again.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Edit form */}
        <div className="md:col-span-2 bg-white border border-neutral-border rounded-lg p-5">
          {canWrite ? (
            <form action={updateCustomer.bind(null, id)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Full name</label>
                  <input name="full_name" defaultValue={customer.full_name} className={field} />
                </div>
                <div>
                  <label className={label}>Company</label>
                  <input name="company_name" defaultValue={customer.company_name} className={field} />
                </div>
                <div>
                  <label className={label}>Email</label>
                  <input name="email" type="email" defaultValue={customer.email ?? ""} className={field} />
                </div>
                <div>
                  <label className={label}>Respond.io contact ID</label>
                  <input
                    name="respondio_contact_id"
                    defaultValue={customer.respondio_contact_id ?? ""}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Assigned staff</label>
                  <select
                    name="assigned_staff_id"
                    defaultValue={customer.assigned_staff_id ?? ""}
                    className={field}
                  >
                    <option value="">— Unassigned —</option>
                    {(staff ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="is_blocked"
                      defaultChecked={customer.is_blocked}
                    />
                    Blocked (never contact)
                  </label>
                </div>
              </div>
              <div>
                <label className={label}>Notes</label>
                <textarea name="notes" rows={3} defaultValue={customer.notes} className={field} />
              </div>
              <button className="bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2 text-sm">
                Save Customer
              </button>
            </form>
          ) : (
            <dl className="text-sm space-y-2">
              <div><dt className="text-charcoal-light inline">Company: </dt><dd className="inline">{customer.company_name || "—"}</dd></div>
              <div><dt className="text-charcoal-light inline">Email: </dt><dd className="inline">{customer.email || "—"}</dd></div>
              <div><dt className="text-charcoal-light inline">Notes: </dt><dd className="inline">{customer.notes || "—"}</dd></div>
            </dl>
          )}
        </div>

        {/* Consent */}
        <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-3">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold">
            Marketing consent (WhatsApp)
          </h2>
          <p>
            <span
              className={`text-xs border rounded-full px-3 py-1 capitalize ${
                marketingStatus === "granted"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : marketingStatus === "revoked"
                    ? "bg-tronic-red-soft text-tronic-red border-tronic-red/30"
                    : "bg-neutral-bg text-charcoal-light border-neutral-border"
              }`}
            >
              {marketingStatus}
            </span>
            {marketing && (
              <span className="block text-xs text-charcoal-light mt-2">
                Recorded {new Date(marketing.recorded_at).toLocaleString()}
              </span>
            )}
          </p>
          {canWrite && (
            <div className="flex gap-2">
              <form action={setConsent.bind(null, id)}>
                <button
                  name="status"
                  value="granted"
                  className="text-xs bg-green-700 hover:bg-green-800 text-white rounded px-3 py-1.5"
                >
                  Record opt-in
                </button>
              </form>
              <form action={setConsent.bind(null, id)}>
                <button
                  name="status"
                  value="revoked"
                  className="text-xs bg-tronic-red hover:bg-tronic-red-dark text-white rounded px-3 py-1.5"
                >
                  Record opt-out
                </button>
              </form>
            </div>
          )}
          <p className="text-[11px] text-charcoal-light">
            Opted-out customers are automatically suppressed from every
            broadcast. Inbound &quot;STOP&quot; messages record an opt-out
            automatically.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Quotation requests
          </h2>
          <ul className="text-sm space-y-1">
            {(rfqs ?? []).length === 0 && (
              <li className="text-charcoal-light">None yet.</li>
            )}
            {(rfqs ?? []).map((r) => (
              <li key={r.id} className="flex justify-between">
                <a
                  href={`/dashboard/rfqs/${r.id}`}
                  className="text-tronic-red hover:underline"
                >
                  {r.reference}
                </a>
                <span className="text-xs text-charcoal-light capitalize">
                  {r.status.replace(/_/g, " ")} ·{" "}
                  {new Date(r.submitted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Recent messages
          </h2>
          <ul className="text-sm space-y-1.5">
            {(messages ?? []).length === 0 && (
              <li className="text-charcoal-light">No logged messages.</li>
            )}
            {(messages ?? []).map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">
                  <span
                    className={`text-[10px] uppercase mr-1 ${m.direction === "outbound" ? "text-tronic-red" : "text-charcoal-light"}`}
                  >
                    {m.direction === "outbound" ? "OUT" : "IN"}
                  </span>
                  {m.body_preview || m.kind}
                </span>
                <span className="text-xs text-charcoal-light shrink-0">
                  {new Date(m.occurred_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
