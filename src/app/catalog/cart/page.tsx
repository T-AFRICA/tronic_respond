import { getLang, t } from "@/lib/catalog/i18n";
import {
  CatalogHeader,
  catalogQuery,
} from "@/components/catalog/CatalogHeader";
import { CartView } from "@/components/catalog/CartView";
import { verifyCatalogToken } from "@/lib/catalog/links";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

  // Personalized link (?t=<signed token> from a broadcast): pre-fill the
  // quotation form with the known customer's details. Invalid/expired tokens
  // are simply ignored — the form stays blank.
  let initial: { name: string; phone: string; company: string } | undefined;
  if (token) {
    const customerId = verifyCatalogToken(token);
    if (customerId) {
      const admin = createSupabaseAdminClient();
      const { data: customer } = await admin
        .from("customers")
        .select("full_name, whatsapp_phone, company_name")
        .eq("id", customerId)
        .maybeSingle();
      if (customer) {
        initial = {
          name: customer.full_name ?? "",
          phone: customer.whatsapp_phone ?? "",
          company: customer.company_name ?? "",
        };
      }
    }
  }

  return (
    <>
      <CatalogHeader lang={lang} dict={dict} token={token} />
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <h1 className="text-lg font-bold">{dict.cart_title}</h1>
        <CartView
          dict={dict}
          catalogHref={`/catalog${catalogQuery(lang, token)}`}
          token={token}
          initial={initial}
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
