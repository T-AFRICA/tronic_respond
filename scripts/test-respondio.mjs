/**
 * Respond.io connectivity test — calls the same endpoints the app uses and
 * prints the raw status + response so failures are diagnosable.
 * Reads RESPOND_IO_API_TOKEN (or RESPONDIO_API_TOKEN) from .env.local.
 */
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
const base =
  process.env.RESPOND_IO_API_URL ||
  process.env.RESPONDIO_API_BASE_URL ||
  "https://api.respond.io/v2";

if (!token) {
  console.error("Add RESPOND_IO_API_TOKEN=... to .env.local first.");
  process.exit(1);
}
console.log(`Base URL: ${base}`);
console.log(`Token: ${token.slice(0, 6)}… (${token.length} chars)\n`);

async function call(label, path, init = {}) {
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const text = await res.text();
    console.log(`[${label}] ${init.method ?? "GET"} ${path}`);
    console.log(`  HTTP ${res.status}`);
    console.log(`  ${text.slice(0, 400).replace(/\n/g, " ")}\n`);
    return res.status;
  } catch (e) {
    console.log(`[${label}] FAILED: ${e.message}\n`);
    return 0;
  }
}

await call("channels", "/space/channel");
await call("contacts (app payload)", "/contact/list?limit=5", {
  method: "POST",
  body: JSON.stringify({ search: "", timezone: "UTC" }),
});
await call("contacts (empty body)", "/contact/list?limit=5", {
  method: "POST",
  body: JSON.stringify({}),
});
