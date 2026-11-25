import crypto from "node:crypto";

/**
 * Secure, expiring personalized catalog links (spec §11).
 * Token = base64url("customerId.expiresEpoch.hmac") signed with
 * CATALOG_LINK_SECRET. Used when customer identification is required —
 * e.g. links sent from the sharing composer — so a catalog RFQ can be
 * attached to the right customer without any login.
 */

function secret(): string | null {
  return process.env.CATALOG_LINK_SECRET || null;
}

function hmac(data: string, key: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("base64url");
}

export function signCatalogToken(
  customerId: string,
  expiresInDays = 30,
): string | null {
  const key = secret();
  if (!key) return null;
  const expires = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  const data = `${customerId}.${expires}`;
  return Buffer.from(`${data}.${hmac(data, key)}`).toString("base64url");
}

export function verifyCatalogToken(token: string): string | null {
  const key = secret();
  if (!key || !token) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot < 0) return null;
    const data = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const expected = hmac(data, key);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const [customerId, expiresStr] = data.split(".");
    if (!customerId || !expiresStr) return null;
    if (Math.floor(Date.now() / 1000) > Number(expiresStr)) return null;
    return customerId;
  } catch {
    return null;
  }
}
