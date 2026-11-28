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

const icon = "h-4 w-4 shrink-0";

function TagIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
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

  const navLink =
    "inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-2 border border-white/25 text-white/95 hover:bg-white/10 hover:border-white/50 transition-colors";

  return (
    <header className="sticky top-0 z-10">
      <div className="bg-tronic-red bg-gradient-to-b from-tronic-red to-tronic-red-dark text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <Link
            href={`/catalog${catalogQuery(lang, token)}`}
            className="min-w-0 flex items-center gap-2.5"
          >
            <span className="bg-white rounded-lg px-2.5 py-2 inline-flex items-center shrink-0 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tronic-logo.webp" alt="TRONIC" className="h-4 w-auto" />
            </span>
            <span className="text-[10px] uppercase tracking-widest text-white/75 leading-tight hidden md:block truncate max-w-40">
              {dict.tagline}
            </span>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href={`/catalog/offers${catalogQuery(lang, token)}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-tronic-red rounded-full px-3 py-2 shadow-sm hover:shadow hover:bg-white/95 transition-shadow"
            >
              <TagIcon />
              <span className="hidden sm:inline">{dict.all_offers}</span>
            </Link>
            <Link
              href={`/catalog${catalogQuery(otherLang(lang), token)}`}
              className={navLink}
              title={dict.language}
            >
              <GlobeIcon />
              <span className="hidden sm:inline">{dict.language}</span>
            </Link>
            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${navLink} hidden sm:inline-flex`}
              >
                <ChatIcon />
                <span className="hidden md:inline">{dict.talk_to_sales}</span>
              </a>
            )}
            <CartBadge
              href={`/catalog/cart${catalogQuery(lang, token)}`}
              label={dict.cart_title}
            />
          </nav>
        </div>
      </div>
    </header>
  );
}
