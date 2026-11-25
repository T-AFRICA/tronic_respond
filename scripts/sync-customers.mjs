/**
 * Bulk customer sync: Respond.io contacts → public.customers.
 * Same rules as the in-app sync (staff edits win; never deletes), but batched.
 * Reads .env.local (Supabase service key + Respond.io token).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const token = process.env.RESPOND_IO_API_TOKEN || process.env.RESPONDIO_API_TOKEN;
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ---- 1. Pull all contacts (up to 20 pages x 100) ----
const contacts = [];
let cursor;
for (let page = 0; page < 200; page++) {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursorId", cursor);
  const res = await fetch(`https://api.respond.io/v2/contact/list?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ search: "", timezone: "UTC", filter: { $and: [] } }),
  });
  if (!res.ok) {
    console.error(`contact/list failed: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const json = await res.json();
  contacts.push(...(json.items ?? []));
  const next = json.pagination?.next;
  cursor = next ? new URL(next).searchParams.get("cursorId") : null;
  if (!cursor || (json.items ?? []).length === 0) break;
}
console.log(`Fetched ${contacts.length} contacts from Respond.io`);

// ---- 2. Normalize + dedupe by phone ----
const seenPhones = new Set();
const rows = [];
let skippedNoPhone = 0;
for (const c of contacts) {
  const phone = (c.phone ?? "").trim();
  if (!phone) {
    skippedNoPhone++;
    continue;
  }
  if (seenPhones.has(phone)) continue;
  seenPhones.add(phone);
  rows.push({
    contactId: String(c.id),
    phone,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
    email: c.email ?? null,
    createdAt: c.created_at ? new Date(c.created_at * 1000).toISOString() : null,
    tags: Array.isArray(c.tags) ? c.tags.map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean) : [],
  });
}

const { data: country } = await admin.from("countries").select("id").eq("iso2", "TZ").single();

// ---- 3. Load existing customers for merge ----
const existingByContact = new Map();
const existingByPhone = new Map();
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
for (const ids of chunk(rows.map((r) => r.contactId), 500)) {
  const { data } = await admin
    .from("customers")
    .select("id, respondio_contact_id, whatsapp_phone, full_name, email, tags, company_name, country_id, is_blocked, last_contact_at")
    .in("respondio_contact_id", ids);
  for (const c of data ?? []) existingByContact.set(c.respondio_contact_id, c);
}
for (const phones of chunk(rows.map((r) => r.phone), 500)) {
  const { data } = await admin
    .from("customers")
    .select("id, respondio_contact_id, whatsapp_phone, full_name, email, tags, company_name, country_id, is_blocked, last_contact_at")
    .in("whatsapp_phone", phones);
  for (const c of data ?? []) existingByPhone.set(c.whatsapp_phone, c);
}

// ---- 4. Build updates (merge; staff edits win) and inserts ----
const updates = [];
const inserts = [];
for (const r of rows) {
  const existing = existingByContact.get(r.contactId) ?? existingByPhone.get(r.phone);
  if (existing) {
    updates.push({
      id: existing.id,
      respondio_contact_id: existing.respondio_contact_id ?? r.contactId,
      whatsapp_phone: existing.whatsapp_phone,
      full_name: existing.full_name || r.name,
      company_name: existing.company_name,
      email: existing.email || r.email,
      tags: r.tags.length > 0 ? r.tags : existing.tags,
      country_id: existing.country_id,
      is_blocked: existing.is_blocked,
      last_contact_at: existing.last_contact_at ?? r.createdAt,
    });
  } else {
    inserts.push({
      respondio_contact_id: r.contactId,
      whatsapp_phone: r.phone,
      full_name: r.name,
      email: r.email,
      tags: r.tags,
      country_id: country.id,
      last_contact_at: r.createdAt,
    });
  }
}

let updated = 0;
for (const batch of chunk(updates, 500)) {
  const { error } = await admin.from("customers").upsert(batch, { onConflict: "id" });
  if (error) console.error("update batch failed:", error.message);
  else updated += batch.length;
}
let created = 0;
for (const batch of chunk(inserts, 500)) {
  const { data, error } = await admin
    .from("customers")
    .upsert(batch, { onConflict: "whatsapp_phone", ignoreDuplicates: true })
    .select("id");
  if (error) console.error("insert batch failed:", error.message);
  else created += data?.length ?? 0;
}

console.log("");
console.log("================ SYNC COMPLETE ================");
console.log(`  Created: ${created}`);
console.log(`  Updated: ${updated}`);
console.log(`  Skipped (no phone): ${skippedNoPhone}`);
console.log("===============================================");
