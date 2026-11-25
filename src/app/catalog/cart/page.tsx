import { getLang, t } from "@/lib/catalog/i18n";
import {
  CatalogHeader,
  catalogQuery,
} from "@/components/catalog/CatalogHeader";
import { CartView } from "@/components/catalog/CartView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Selection — TRONIC" };

export default async function CatalogCartPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const lang = getLang(sp.lang);
  const dict = t(lang);
  const token = sp.t;

  return (
    <>
      <CatalogHeader lang={lang} dict={dict} token={token} />
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <h1 className="text-lg font-bold">{dict.cart_title}</h1>
        <CartView
          dict={dict}
          catalogHref={`/catalog${catalogQuery(lang, token)}`}
          token={token}
        />
        {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER && (
          <p className="text-center">
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-700 font-semibold hover:underline"
            >
              {dict.talk_to_sales} →
            </a>
          </p>
        )}
      </main>
    </>
  );
}
