"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createManualRfq(formData: FormData) {
  const profile = await requirePermission("rfqs.write");
  const customerId = String(formData.get("customer_id") ?? "");
  const itemsRaw = String(formData.get("items") ?? "");
  const notes = String(formData.get("notes") ?? "");

  const lines = itemsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    const [sku, qty] = line.split(",").map((s) => s.trim());
    return { sku, quantity: Number(qty) };
  });

  if (
    !customerId ||
    parsed.length === 0 ||
    parsed.some((p) => !p.sku || !Number.isFinite(p.quantity) || p.quantity <= 0)
  ) {
    redirect("/dashboard/rfqs/new?error=validation");
  }

  const supabase = await createSupabaseServerClient();

  const skus = parsed.map((p) => p.sku);
  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name")
    .in("sku", skus);
  const productMap = new Map((products ?? []).map((p) => [p.sku, p]));

  const { data: rfq, error } = await supabase
    .from("rfqs")
    .insert({
      customer_id: customerId,
      source: "manual",
      status: "assigned",
      customer_notes: notes,
      assigned_staff_id: profile.id,
      assigned_at: new Date().toISOString(),
      assigned_by: profile.id,
      idempotency_key: `manual:${crypto.randomUUID()}`,
    })
    .select("id")
    .single();

  if (error || !rfq) redirect("/dashboard/rfqs/new?error=save");

  await supabase.from("rfq_items").insert(
    parsed.map((p) => {
      const product = productMap.get(p.sku);
      return {
        rfq_id: rfq.id,
        product_id: product?.id ?? null,
        sku: p.sku,
        product_name: product?.name ?? p.sku,
        quantity: p.quantity,
        mapping_status: product ? "manual" : "unmapped",
      };
    }),
  );

  revalidatePath("/dashboard/rfqs");
  redirect(`/dashboard/rfqs/${rfq.id}`);
}
