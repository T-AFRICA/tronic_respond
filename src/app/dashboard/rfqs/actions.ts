"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function assignRfq(rfqId: string, formData: FormData) {
  const profile = await requirePermission("rfqs.assign");
  const staffId = String(formData.get("staff_id") ?? "");
  if (!staffId) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("rfqs")
    .update({
      assigned_staff_id: staffId,
      assigned_at: new Date().toISOString(),
      assigned_by: profile.id,
      status: "assigned",
    })
    .eq("id", rfqId);

  if (!error) {
    await supabase.from("notifications").insert({
      user_id: staffId,
      kind: "rfq_assigned",
      title: "RFQ assigned to you",
      body: `Assigned by ${profile.full_name}`,
      link: `/dashboard/rfqs/${rfqId}`,
    });
  }

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  revalidatePath("/dashboard/rfqs");
}

export async function setRfqStatus(rfqId: string, formData: FormData) {
  await requirePermission("rfqs.write");
  const status = String(formData.get("status") ?? "");
  if (!["under_review", "closed", "cancelled"].includes(status)) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("rfqs").update({ status }).eq("id", rfqId);

  revalidatePath(`/dashboard/rfqs/${rfqId}`);
  revalidatePath("/dashboard/rfqs");
}

/**
 * Create a draft quotation from an RFQ: copies mapped items and snapshots
 * the current retail price as the list price (historical price snapshot).
 */
export async function createQuotationFromRfq(rfqId: string) {
  const profile = await requirePermission("quotations.write");
  const supabase = await createSupabaseServerClient();

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("*, rfq_items(*)")
    .eq("id", rfqId)
    .single();
  if (!rfq) redirect("/dashboard/rfqs");

  const { data: quotation, error } = await supabase
    .from("quotations")
    .insert({
      rfq_id: rfq.id,
      customer_id: rfq.customer_id,
      status: "under_review",
      prepared_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !quotation) redirect(`/dashboard/rfqs/${rfqId}?error=quote`);

  const mappedItems = (rfq.rfq_items ?? []).filter(
    (i: { product_id: string | null }) => i.product_id,
  );

  const productIds = mappedItems.map((i: { product_id: string }) => i.product_id);
  const { data: prices } = productIds.length
    ? await supabase
        .from("current_product_prices")
        .select("product_id, price_type, amount")
        .in("product_id", productIds)
    : { data: [] };

  const retailPrice = (pid: string) =>
    prices?.find((p) => p.product_id === pid && p.price_type === "retail")
      ?.amount ?? 0;

  if (mappedItems.length > 0) {
    await supabase.from("quotation_items").insert(
      mappedItems.map(
        (
          item: {
            product_id: string;
            sku: string;
            product_name: string;
            quantity: number;
          },
          idx: number,
        ) => {
          const list = retailPrice(item.product_id);
          return {
            quotation_id: quotation.id,
            product_id: item.product_id,
            sku: item.sku,
            product_name: item.product_name,
            quantity: item.quantity,
            list_price: list,
            price_type: "retail",
            unit_price: list,
            line_total: list * item.quantity,
            sort_order: idx,
          };
        },
      ),
    );

    // Keep the quotation header in sync — otherwise a quotation that goes
    // straight to PDF/approval without a builder save shows 0 totals.
    const subtotal = mappedItems.reduce(
      (sum: number, item: { product_id: string; quantity: number }) =>
        sum + retailPrice(item.product_id) * item.quantity,
      0,
    );
    await supabase
      .from("quotations")
      .update({ subtotal, grand_total: subtotal })
      .eq("id", quotation.id);
  }

  await supabase.from("rfqs").update({ status: "quoted" }).eq("id", rfqId);

  revalidatePath("/dashboard/quotations");
  redirect(`/dashboard/quotations/${quotation.id}`);
}
