// Send ONE catalog item, then poll the batch handle for per-item errors.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const token = process.env.META_ACCESS_TOKEN;
const catalogId = process.env.META_CATALOG_ID;
const base = "https://graph.facebook.com/v21.0";

// Pull one real synced product from Supabase
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: p } = await db
  .from("products")
  .select("id, sku, name, brand, description, currency, availability, product_images(public_url, is_primary)")
  .eq("visibility", "published")
  .not("product_images", "is", null)
  .limit(1)
  .single();
const { data: price } = await db
  .from("current_product_prices")
  .select("amount")
  .eq("product_id", p.id)
  .eq("price_type", "retail")
  .single();
const img = p.product_images.find((i) => i.is_primary) ?? p.product_images[0];

const item = {
  method: "UPDATE",
  data: {
    id: p.sku,
    title: p.name,
    description: p.description || p.name,
    image_link: img.public_url,
    link: `https://www.tronic.ltd/catalog/p/${encodeURIComponent(p.sku)}`,
    price: `${Number(price.amount).toFixed(2)} ${p.currency || "TZS"}`,
    availability: "in stock",
    brand: p.brand || undefined,
    condition: "new",
  },
};
console.log("ITEM:", JSON.stringify(item, null, 1));

const res = await fetch(`${base}/${catalogId}/items_batch`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ item_type: "PRODUCT_ITEM", requests: [item] }),
});
const body = await res.json();
console.log("BATCH RESPONSE:", res.status, JSON.stringify(body));

const handle = body.handles?.[0];
if (!handle) process.exit(1);

for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const st = await fetch(
    `${base}/${catalogId}/check_batch_request_status?handle=${encodeURIComponent(handle)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const stBody = await st.json();
  console.log(`STATUS ${i}:`, JSON.stringify(stBody).slice(0, 1500));
  const s = stBody.data?.[0]?.status;
  if (s && s !== "in_progress" && s !== "initial") break;
}
