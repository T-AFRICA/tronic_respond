/** Quick diagnostic: which app tables exist in the configured Supabase project. */
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

console.log(`Project: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
const tables = [
  "roles",
  "countries",
  "profiles",
  "categories",
  "products",
  "pilot_products",
  "customers",
  "offers",
  "campaigns",
  "system_settings",
];
for (const t of tables) {
  const { count, error } = await admin
    .from(t)
    .select("*", { count: "exact", head: true });
  console.log(
    error
      ? `  ${t.padEnd(16)} MISSING/ERROR → ${error.message}`
      : `  ${t.padEnd(16)} OK (${count} rows)`,
  );
}
