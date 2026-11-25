import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ShareComposer } from "@/components/sharing/ShareComposer";

export const metadata = { title: "Direct Product Sharing" };
export const dynamic = "force-dynamic";

export default async function SharingPage() {
  await requirePermission("sharing.send");
  const supabase = await createSupabaseServerClient();

  const { data: shares } = await supabase
    .from("product_shares")
    .select("*, customers(full_name, whatsapp_phone), profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="display text-2xl font-black">Direct Product Sharing</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Share products with customers over WhatsApp without manual image
          downloads and forwarding.
        </p>
      </div>

      <ShareComposer />

      <p className="text-xs text-charcoal-light">
        Respond.io&apos;s native product-sharing interface remains available
        where it is the simplest workflow; shares sent there are not recorded
        here.
      </p>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Shared by</th>
              <th>Type</th>
              <th>Products</th>
            </tr>
          </thead>
          <tbody>
            {(shares ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-charcoal-light py-8">
                  No sharing history yet.
                </td>
              </tr>
            )}
            {(shares ?? []).map((s) => {
              const customer = Array.isArray(s.customers) ? s.customers[0] : s.customers;
              const staff = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
              return (
                <tr key={s.id}>
                  <td className="text-xs text-charcoal-light">
                    {new Date(s.created_at).toLocaleString()}
                  </td>
                  <td>{customer?.full_name || customer?.whatsapp_phone}</td>
                  <td>{staff?.full_name}</td>
                  <td className="capitalize text-xs">
                    {s.share_kind.replace(/_/g, " ")}
                  </td>
                  <td>{s.product_ids?.length ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
