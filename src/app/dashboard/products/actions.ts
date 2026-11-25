"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const productSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(120).default(""),
  model_number: z.string().trim().max(120).default(""),
  category_id: z.string().uuid().nullable(),
  description: z.string().trim().max(5000).default(""),
  unit_of_measure: z.string().trim().max(20).default("pc"),
  currency: z.string().trim().length(3).toUpperCase().default("TZS"),
  availability: z.enum(["available", "on_request", "discontinued"]),
  visibility: z.enum(["draft", "published", "archived"]),
  retail_price: z.coerce.number().nonnegative().optional(),
  wholesale_price: z.coerce.number().nonnegative().optional(),
});

function parseForm(formData: FormData) {
  const categoryRaw = String(formData.get("category_id") ?? "");
  return productSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    brand: formData.get("brand") ?? "",
    model_number: formData.get("model_number") ?? "",
    category_id: categoryRaw || null,
    description: formData.get("description") ?? "",
    unit_of_measure: formData.get("unit_of_measure") || "pc",
    currency: formData.get("currency") || "TZS",
    availability: formData.get("availability"),
    visibility: formData.get("visibility"),
    retail_price: formData.get("retail_price") || undefined,
    wholesale_price: formData.get("wholesale_price") || undefined,
  });
}

async function savePrices(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  userId: string,
  currency: string,
  retail?: number,
  wholesale?: number,
) {
  const rows = [];
  if (retail !== undefined)
    rows.push({ product_id: productId, price_type: "retail", amount: retail, currency, created_by: userId });
  if (wholesale !== undefined)
    rows.push({ product_id: productId, price_type: "wholesale", amount: wholesale, currency, created_by: userId });
  if (rows.length) await supabase.from("product_prices").insert(rows);
}

export async function createProduct(formData: FormData) {
  const profile = await requirePermission("products.write");
  const parsed = parseForm(formData);
  if (!parsed.success) redirect("/dashboard/products/new?error=validation");

  const { retail_price, wholesale_price, ...fields } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("products")
    .insert({ ...fields, country_id: profile.country_id, created_by: profile.id })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/dashboard/products/new?error=${error?.code === "23505" ? "duplicate_sku" : "save"}`,
    );
  }

  await savePrices(supabase, data.id, profile.id, fields.currency, retail_price, wholesale_price);

  revalidatePath("/dashboard/products");
  redirect(`/dashboard/products/${data.id}`);
}

export async function updateProduct(id: string, formData: FormData) {
  const profile = await requirePermission("products.write");
  const parsed = parseForm(formData);
  if (!parsed.success) redirect(`/dashboard/products/${id}?error=validation`);

  const { retail_price, wholesale_price, ...fields } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("products").update(fields).eq("id", id);
  if (error) {
    redirect(
      `/dashboard/products/${id}?error=${error.code === "23505" ? "duplicate_sku" : "save"}`,
    );
  }

  await savePrices(supabase, id, profile.id, fields.currency, retail_price, wholesale_price);

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${id}`);
  redirect(`/dashboard/products/${id}?saved=1`);
}
