/**
 * One-time setup: create (or repair) the Super Admin staff account.
 *
 * Usage:  node scripts/create-super-admin.mjs <email> [full name]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * - Creates the auth user if missing (email pre-confirmed) with a generated
 *   strong password, or resets the password + confirms the email if the user
 *   already exists.
 * - Upserts the public.profiles row with the super_admin role.
 * - Prints the password ONCE to the console — store it safely, then change it
 *   anytime via the Supabase dashboard.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- minimal .env.local loader (no extra deps) ---
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] ?? "").trim().toLowerCase();
const fullName = process.argv[3] ?? "Super Admin";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/create-super-admin.mjs <email> [full name]");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// URL-safe strong password
const password = randomBytes(12).toString("base64url") + "!A9";

// ---- find or create the auth user ----
let userId = null;
const { data: list, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}
const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);

if (existing) {
  userId = existing.id;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("Password reset failed:", error.message);
    process.exit(1);
  }
  console.log(`Existing auth user found (${userId}) — password reset, email confirmed.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("User creation failed:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Auth user created (${userId}), email pre-confirmed.`);
}

// ---- role + country lookups ----
const { data: role, error: roleError } = await admin
  .from("roles")
  .select("id")
  .eq("key", "super_admin")
  .single();
const { data: country, error: countryError } = await admin
  .from("countries")
  .select("id")
  .eq("iso2", "TZ")
  .single();
if (roleError || countryError || !role || !country) {
  console.error(
    "roles/countries tables not found — run the migrations (0001–0011) on this Supabase project first.",
  );
  process.exit(1);
}

// ---- upsert profile ----
const { error: profileError } = await admin.from("profiles").upsert(
  {
    id: userId,
    full_name: fullName,
    email,
    role_id: role.id,
    country_id: country.id,
    is_active: true,
  },
  { onConflict: "id" },
);
if (profileError) {
  console.error("Profile upsert failed:", profileError.message);
  process.exit(1);
}

// ---- sanity: pilot products present? ----
const { count } = await admin
  .from("pilot_products")
  .select("id", { count: "exact", head: true });

console.log("");
console.log("================= SUPER ADMIN READY =================");
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log("  (change it later in Supabase → Authentication → Users)");
console.log("=====================================================");
console.log("");
console.log(`pilot_products rows in this project: ${count ?? 0}`);
console.log(`Supabase project: ${url}`);
