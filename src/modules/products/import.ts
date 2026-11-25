import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Excel/CSV product import.
 * - Upserts by SKU (the stable business key).
 * - Validates every row; collects per-row errors instead of aborting the batch.
 * - Duplicate SKUs inside one file are rejected (first occurrence wins).
 * - Wholesale/retail prices create new product_prices history rows.
 *
 * Expected columns (case-insensitive, flexible order):
 * sku, name, brand, model_number, category, subcategory, description,
 * unit_of_measure, retail_price, wholesale_price, currency, availability
 */

const rowSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(64),
  name: z.string().trim().min(1, "Name is required").max(300),
  brand: z.string().trim().max(120).default(""),
  model_number: z.string().trim().max(120).default(""),
  category: z.string().trim().max(120).default(""),
  subcategory: z.string().trim().max(120).default(""),
  description: z.string().trim().max(5000).default(""),
  unit_of_measure: z.string().trim().max(20).default("pc"),
  retail_price: z.coerce.number().nonnegative().optional(),
  wholesale_price: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("TZS"),
  availability: z
    .enum(["available", "on_request", "discontinued"])
    .default("available"),
});

export type ImportRow = z.infer<typeof rowSchema>;
export type ImportRowError = { row: number; sku: string; message: string };

export type ImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function parseFile(
  buffer: Buffer,
  fileName: string,
): Record<string, string>[] {
  if (/\.(xlsx|xls)$/i.test(fileName)) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: "",
    });
    return rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [normalizeHeader(k), String(v ?? "")]),
      ),
    );
  }
  const parsed = Papa.parse<Record<string, string>>(buffer.toString("utf-8"), {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });
  return parsed.data;
}

export async function runImport(
  buffer: Buffer,
  fileName: string,
  importId: string,
  createdBy: string,
  countryId: number,
): Promise<ImportResult> {
  const admin = createSupabaseAdminClient();
  const rawRows = parseFile(buffer, fileName);
  const errors: ImportRowError[] = [];
  const seenSkus = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await admin
    .from("product_imports")
    .update({
      status: "processing",
      total_rows: rawRows.length,
      started_at: new Date().toISOString(),
    })
    .eq("id", importId);

  // Pre-load category map (name -> id), creating missing categories lazily
  const { data: cats } = await admin.from("categories").select("id, name");
  const categoryByName = new Map(
    (cats ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );

  async function resolveCategory(
    name: string,
    parentName?: string,
  ): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    const hit = categoryByName.get(key);
    if (hit) return hit;
    let parentId: string | null = null;
    if (parentName) parentId = await resolveCategory(parentName);
    const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: inserted, error } = await admin
      .from("categories")
      .insert({ name, slug, parent_id: parentId })
      .select("id")
      .single();
    if (error || !inserted) return null;
    categoryByName.set(key, inserted.id);
    return inserted.id;
  }

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // 1-based + header row
    const parsed = rowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        sku: rawRows[i]?.sku ?? "",
        message: parsed.error.issues.map((e) => e.message).join("; "),
      });
      continue;
    }
    const row = parsed.data;

    if (seenSkus.has(row.sku)) {
      skipped++;
      errors.push({
        row: rowNum,
        sku: row.sku,
        message: "Duplicate SKU in file — skipped",
      });
      continue;
    }
    seenSkus.add(row.sku);

    const categoryId = await resolveCategory(
      row.subcategory || row.category,
      row.subcategory ? row.category : undefined,
    );

    const { data: existing } = await admin
      .from("products")
      .select("id")
      .eq("sku", row.sku)
      .maybeSingle();

    const productFields = {
      sku: row.sku,
      name: row.name,
      brand: row.brand,
      model_number: row.model_number,
      category_id: categoryId,
      description: row.description,
      unit_of_measure: row.unit_of_measure,
      currency: row.currency,
      availability: row.availability,
      country_id: countryId,
    };

    let productId: string;
    if (existing) {
      const { error } = await admin
        .from("products")
        .update(productFields)
        .eq("id", existing.id);
      if (error) {
        errors.push({ row: rowNum, sku: row.sku, message: error.message });
        continue;
      }
      productId = existing.id;
      updated++;
    } else {
      const { data: ins, error } = await admin
        .from("products")
        .insert({ ...productFields, created_by: createdBy })
        .select("id")
        .single();
      if (error || !ins) {
        errors.push({
          row: rowNum,
          sku: row.sku,
          message: error?.message ?? "Insert failed",
        });
        continue;
      }
      productId = ins.id;
      created++;
    }

    // Price history rows (only when a price is provided)
    const priceRows = [];
    if (row.retail_price !== undefined) {
      priceRows.push({
        product_id: productId,
        price_type: "retail",
        amount: row.retail_price,
        currency: row.currency,
        created_by: createdBy,
      });
    }
    if (row.wholesale_price !== undefined) {
      priceRows.push({
        product_id: productId,
        price_type: "wholesale",
        amount: row.wholesale_price,
        currency: row.currency,
        created_by: createdBy,
      });
    }
    if (priceRows.length > 0) {
      const { error } = await admin.from("product_prices").insert(priceRows);
      if (error) {
        errors.push({
          row: rowNum,
          sku: row.sku,
          message: `Product saved but price failed: ${error.message}`,
        });
      }
    }
  }

  const status =
    errors.length === 0
      ? "completed"
      : created + updated > 0
        ? "completed_with_errors"
        : "failed";

  await admin
    .from("product_imports")
    .update({
      status,
      created_rows: created,
      updated_rows: updated,
      skipped_rows: skipped,
      error_rows: errors.length,
      errors: errors.slice(0, 500), // cap stored errors
      finished_at: new Date().toISOString(),
    })
    .eq("id", importId);

  return { totalRows: rawRows.length, created, updated, skipped, errors };
}
