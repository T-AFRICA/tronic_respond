import Link from "next/link";
import { CartBadge } from "@/components/catalog/CartWidgets";
import type { CatalogDict, CatalogLang } from "@/lib/catalog/i18n";
import { otherLang } from "@/lib/catalog/i18n";

export function catalogQuery(
  lang: CatalogLang,
  token: string | undefined,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (lang === "sw") params.set("lang", "sw");
  if (token) params.set("t", token);
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function CatalogHeader({
  lang,
  dict,
  token,
}: {
  lang: CatalogLang;
  dict: CatalogDict;
  token?: string;
}) {
  const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  return (
    <header className="bg-tronic-red text-white sticky top-0 z-10 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href={`/catalog${catalogQuery(lang, token)}`}
          className="min-w-0"
        >
          <span className="display font-black text-lg leading-tight block truncate">
            TRONIC
          </span>
          <span className="text-[10px] text-white/80 leading-tight block truncate">
            {dict.tagline}
          </span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/catalog/offers${catalogQuery(lang, token)}`}
            className="text-xs font-semibold bg-white text-tronic-red rounded px-2 py-1.5 hover:bg-white/90"
          >
            {dict.all_offers}
          </Link>
          <Link
            href={`/catalog${catalogQuery(otherLang(lang), token)}`}
            className="text-xs border border-white/40 rounded px-2 py-1.5 hover:bg-white/10"
          >
            {dict.language}
          </Link>
          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-block text-xs border border-white/40 rounded px-2 py-1.5 hover:bg-white/10"
            >
              {dict.talk_to_sales}
            </a>
          )}
          <CartBadge
            href={`/catalog/cart${catalogQuery(lang, token)}`}
            label={dict.cart_title}
          />
        </div>
      </div>
    </header>
  );
}
