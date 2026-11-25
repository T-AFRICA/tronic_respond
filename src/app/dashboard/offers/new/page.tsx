import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfferForm } from "@/components/offers/OfferForm";

export const metadata = { title: "New Offer" };
export const dynamic = "force-dynamic";

export default async function NewOfferPage() {
  await requirePermission("offers.write");
  const supabase = await createSupabaseServerClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="display text-2xl font-black">New Offer</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Select products, set discounted prices and an optional schedule.
          <Link href="/dashboard/offers" className="text-tronic-red hover:underline ml-2">
            ← All offers
          </Link>
        </p>
      </div>
      <OfferForm categories={categories ?? []} />
    </div>
  );
}
