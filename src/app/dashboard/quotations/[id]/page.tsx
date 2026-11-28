import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EDITABLE_STATUSES } from "@/modules/quotations/service";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";
import { PdfButton } from "@/components/quotations/PdfButton";
import {
  submitForApproval,
  decideApproval,
  generatePdf,
  sendQuotation,
  recordDecision,
  startRevision,
  setQuotationStatus,
} from "./actions";
import type { QuotationStatus } from "@/lib/types";

export const metadata = { title: "Quotation" };
export const dynamic = "force-dynamic";

const BANNERS: Record<string, { ok: boolean; text: string }> = {
  approved: { ok: true, text: "Quotation approved." },
  requested: { ok: true, text: "Approval requested — managers have been notified." },
  pdf: { ok: true, text: "PDF generated and stored securely." },
  sent: { ok: true, text: "Quotation sent to the customer via WhatsApp." },
  state: { ok: false, text: "That action is not allowed in the current status." },
  noitems: { ok: false, text: "Add at least one line item first." },
  notapproved: { ok: false, text: "The quotation must be approved first." },
  nopdf: { ok: false, text: "Generate the PDF before sending." },
  norespondio: { ok: false, text: "Respond.io is not configured (RESPOND_IO_API_TOKEN)." },
  nocontact: { ok: false, text: "This customer has no Respond.io contact ID — link it on the customer record, or send the PDF manually from the Respond.io inbox." },
  sendfailed: { ok: false, text: "Respond.io rejected the send — check Integrations and retry, or deliver manually from the inbox." },
  window: { ok: false, text: "WhatsApp's 24-hour window is closed for this customer — PDFs can only be delivered after the customer messages the business. Ask them to send any message to the business number, then press Send again." },
  sign: { ok: false, text: "Could not create a secure document link." },
  pdfupload: { ok: false, text: "PDF storage failed — try again." },
};

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-green-50 text-green-700 border-green-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-green-50 text-green-700 border-green-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-tronic-red-soft text-tronic-red border-tronic-red/30",
  revision_requested: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-neutral-bg text-charcoal-light border-neutral-border",
  expired: "bg-neutral-bg text-charcoal-light border-neutral-border",
};

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await requirePermission("quotations.read");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: q }, { data: approvals }, { data: versions }] =
    await Promise.all([
      supabase
        .from("quotations")
        .select(
          "*, quotation_items(*), customers(id, full_name, whatsapp_phone, company_name, respondio_contact_id), rfqs(id, reference)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("quotation_approvals")
        .select("*, requester:profiles!quotation_approvals_requested_by_fkey(full_name), approver:profiles!quotation_approvals_approver_id_fkey(full_name)")
        .eq("quotation_id", id)
        .order("requested_at", { ascending: false }),
      supabase
        .from("quotation_versions")
        .select("version, created_at")
        .eq("quotation_id", id)
        .order("version", { ascending: false }),
    ]);

  if (!q) notFound();

  const status = q.status as QuotationStatus;
  const customer = Array.isArray(q.customers) ? q.customers[0] : q.customers;
  const rfq = Array.isArray(q.rfqs) ? q.rfqs[0] : q.rfqs;
  const canWrite = hasPermission(profile, "quotations.write");
  const canApprove = hasPermission(profile, "quotations.approve");
  const canSend = hasPermission(profile, "quotations.send");
  const editable = canWrite && EDITABLE_STATUSES.includes(status);
  const pendingApproval = (approvals ?? []).find((a) => a.decision === "pending");

  const banner = Object.keys(sp)
    .map((k) => BANNERS[k])
    .find(Boolean);

  const items = (q.quotation_items ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) =>
      a.sort_order - b.sort_order,
  );

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display text-2xl font-black">{q.reference}</h1>
            <span
              className={`text-xs border rounded-full px-3 py-1 capitalize ${STATUS_STYLE[status] ?? "bg-neutral-bg text-charcoal-light border-neutral-border"}`}
            >
              {status.replace(/_/g, " ")}
            </span>
            <span className="text-sm text-charcoal-light">v{q.version}</span>
          </div>
          <p className="text-sm text-charcoal-light mt-1">
            {customer?.full_name || customer?.whatsapp_phone}
            {customer?.company_name ? ` · ${customer.company_name}` : ""}
            {rfq && (
              <>
                {" · from "}
                <Link href={`/dashboard/rfqs/${rfq.id}`} className="text-tronic-red hover:underline">
                  {rfq.reference}
                </Link>
              </>
            )}
          </p>
        </div>

        {/* Workflow actions */}
        <div className="flex gap-2 flex-wrap items-center">
          {editable && canWrite && (
            <form action={submitForApproval.bind(null, id)}>
              <button className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-4 py-2">
                Submit for Approval
              </button>
            </form>
          )}
          {status === "approved" && canWrite && (
            <form action={generatePdf.bind(null, id)}>
              <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
                {q.pdf_storage_path ? "Regenerate PDF" : "Generate PDF"}
              </button>
            </form>
          )}
          {q.pdf_storage_path && <PdfButton quotationId={id} />}
          {status === "approved" && q.pdf_storage_path && canSend && (
            <form action={sendQuotation.bind(null, id)}>
              <button className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold rounded px-4 py-2">
                Send via WhatsApp
              </button>
            </form>
          )}
          {status === "revision_requested" && canWrite && (
            <form action={startRevision.bind(null, id)}>
              <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
                Start Revision (v{q.version + 1})
              </button>
            </form>
          )}
          {status === "accepted" && canWrite && (
            <form action={setQuotationStatus.bind(null, id, "completed" as QuotationStatus)}>
              <button className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold rounded px-4 py-2">
                Mark Completed
              </button>
            </form>
          )}
          {!["completed", "rejected", "cancelled", "accepted", "sent"].includes(status) &&
            canWrite && (
              <form action={setQuotationStatus.bind(null, id, "cancelled" as QuotationStatus)}>
                <button className="text-sm border border-neutral-border bg-white text-charcoal-light rounded px-4 py-2 hover:text-tronic-red hover:border-tronic-red/40">
                  Cancel
                </button>
              </form>
            )}
        </div>
      </div>

      {banner && (
        <p
          className={`text-sm rounded px-3 py-2 border ${
            banner.ok
              ? "text-green-700 bg-green-50 border-green-200"
              : "text-tronic-red bg-tronic-red-soft border-tronic-red/20"
          }`}
        >
          {banner.text}
        </p>
      )}

      {/* Pending approval panel (managers) */}
      {pendingApproval && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800">
            Approval pending — requested by{" "}
            {(Array.isArray(pendingApproval.requester)
              ? pendingApproval.requester[0]
              : pendingApproval.requester
            )?.full_name ?? "staff"}{" "}
            on {new Date(pendingApproval.requested_at).toLocaleString()}
            {" "}(contains discounts)
          </p>
          {canApprove && (
            <form
              action={decideApproval.bind(null, id, pendingApproval.id)}
              className="mt-3 flex gap-2 items-start flex-wrap"
            >
              <input
                name="comments"
                placeholder="Comments (optional)"
                className="flex-1 min-w-60 rounded border border-amber-300 bg-white px-3 py-2 text-sm"
              />
              <button
                name="decision"
                value="approved"
                className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold rounded px-4 py-2"
              >
                Approve
              </button>
              <button
                name="decision"
                value="rejected"
                className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
              >
                Return for Changes
              </button>
            </form>
          )}
        </div>
      )}

      {/* Customer decision capture (sent quotations) */}
      {status === "sent" && canWrite && (
        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <p className="text-sm font-medium mb-2">
            Record the customer&apos;s response
          </p>
          <form action={recordDecision.bind(null, id)} className="flex gap-2 items-start flex-wrap">
            <input
              name="notes"
              placeholder="Notes from the customer (optional)"
              className="flex-1 min-w-60 rounded border border-neutral-border px-3 py-2 text-sm"
            />
            <button
              name="decision"
              value="accepted"
              className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold rounded px-4 py-2"
            >
              Accepted
            </button>
            <button
              name="decision"
              value="revision_requested"
              className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded px-4 py-2"
            >
              Revision Requested
            </button>
            <button
              name="decision"
              value="rejected"
              className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
            >
              Rejected
            </button>
          </form>
          <p className="text-xs text-charcoal-light mt-2">
            An accepted quotation records a sales outcome — it is not a payment
            or a confirmed sale.
          </p>
        </div>
      )}

      {q.decision_notes && ["accepted", "rejected", "revision_requested", "completed"].includes(status) && (
        <p className="text-sm bg-white border border-neutral-border rounded px-3 py-2">
          <span className="text-charcoal-light">Customer notes:</span>{" "}
          {q.decision_notes}
        </p>
      )}

      {/* Builder or read-only view */}
      {editable ? (
        <QuotationBuilder
          quotationId={id}
          initialLines={items.map((i: Record<string, unknown>) => ({
            product_id: i.product_id as string | null,
            sku: i.sku as string,
            product_name: i.product_name as string,
            quantity: Number(i.quantity),
            list_price: Number(i.list_price),
            price_type: i.price_type as "retail" | "wholesale",
            unit_price: Number(i.unit_price),
            discount_pct: Number(i.discount_pct),
            tax_pct: Number(i.tax_pct),
            availability_note: (i.availability_note as string) ?? "",
          }))}
          initialCurrency={q.currency}
          initialDelivery={Number(q.delivery_charge)}
          initialValidUntil={q.valid_until}
          initialTerms={q.terms_conditions}
          initialNotes={q.internal_notes}
          canSeeWholesale={canWrite}
        />
      ) : (
        <>
          <div className="border border-neutral-border rounded-lg overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Disc %</th>
                  <th>Tax %</th>
                  <th className="text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {items.map(
                  (item: {
                    id: string;
                    sku: string;
                    product_name: string;
                    availability_note: string;
                    quantity: number;
                    unit_price: number;
                    discount_pct: number;
                    tax_pct: number;
                    line_total: number;
                  }) => (
                    <tr key={item.id}>
                      <td className="font-mono text-xs">{item.sku}</td>
                      <td>
                        {item.product_name}
                        {item.availability_note && (
                          <span className="block text-xs text-charcoal-light">
                            {item.availability_note}
                          </span>
                        )}
                      </td>
                      <td>{item.quantity}</td>
                      <td>{Number(item.unit_price).toLocaleString()}</td>
                      <td>{item.discount_pct}%</td>
                      <td>{item.tax_pct}%</td>
                      <td className="text-right">
                        {Number(item.line_total).toLocaleString()}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <dl className="text-sm space-y-1 w-72 bg-white border border-neutral-border rounded-lg p-4">
              <div className="flex justify-between">
                <dt className="text-charcoal-light">Subtotal</dt>
                <dd>{Number(q.subtotal).toLocaleString()} {q.currency}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-charcoal-light">Discounts</dt>
                <dd>−{Number(q.discount_total).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-charcoal-light">Tax</dt>
                <dd>{Number(q.tax_total).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-charcoal-light">Delivery</dt>
                <dd>{Number(q.delivery_charge).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between font-bold border-t border-neutral-border pt-1">
                <dt>Grand total</dt>
                <dd className="text-tronic-red">
                  {Number(q.grand_total).toLocaleString()} {q.currency}
                </dd>
              </div>
              {q.valid_until && (
                <div className="flex justify-between text-xs pt-1">
                  <dt className="text-charcoal-light">Valid until</dt>
                  <dd>{new Date(q.valid_until).toLocaleDateString()}</dd>
                </div>
              )}
            </dl>
          </div>
        </>
      )}

      {/* History */}
      {((versions && versions.length > 0) || (approvals && approvals.length > 0)) && (
        <section className="grid md:grid-cols-2 gap-4">
          {versions && versions.length > 0 && (
            <div className="bg-white border border-neutral-border rounded-lg p-4">
              <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
                Version history
              </h2>
              <ul className="text-sm space-y-1">
                {versions.map((v) => (
                  <li key={v.version} className="flex justify-between">
                    <span>Version {v.version}</span>
                    <span className="text-xs text-charcoal-light">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {approvals && approvals.length > 0 && (
            <div className="bg-white border border-neutral-border rounded-lg p-4">
              <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
                Approval history
              </h2>
              <ul className="text-sm space-y-1">
                {approvals.map((a) => {
                  const approver = Array.isArray(a.approver) ? a.approver[0] : a.approver;
                  return (
                    <li key={a.id} className="flex justify-between">
                      <span className="capitalize">
                        v{a.version}: {a.decision}
                        {approver ? ` by ${approver.full_name}` : ""}
                      </span>
                      <span className="text-xs text-charcoal-light">
                        {a.decided_at
                          ? new Date(a.decided_at).toLocaleString()
                          : "pending"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
