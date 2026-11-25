import Link from "next/link";
import {
  Package,
  Users,
  BadgePercent,
  Inbox,
  FileText,
  Megaphone,
  MessageSquareText,
  TrendingUp,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireProfile, hasPermission } from "@/lib/auth/session";
import { respondIoConfig, isLiveBroadcastingEnabled } from "@/lib/config";
import { isQueueConfigured } from "@/lib/queue";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

async function count(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: string,
  filter?: (q: any) => any,
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: n, error } = await query;
  if (error) return 0;
  return n ?? 0;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  tone?: "neutral" | "red" | "green" | "amber" | "blue";
  hint?: string;
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "bg-neutral-bg", fg: "text-charcoal-light" },
    red: { bg: "bg-tronic-red-soft", fg: "text-tronic-red" },
    green: { bg: "bg-green-50", fg: "text-green-700" },
    amber: { bg: "bg-amber-50", fg: "text-amber-700" },
    blue: { bg: "bg-blue-50", fg: "text-blue-700" },
  };
  const t = tones[tone];
  const body = (
    <div className="bg-white border border-neutral-border rounded-xl px-4 py-3.5 flex items-start gap-3 h-full transition-all hover:border-charcoal-light/30 hover:shadow-md">
      <span className={`w-10 h-10 rounded-lg ${t.bg} ${t.fg} flex items-center justify-center shrink-0`}>
        <Icon size={19} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[26px] font-bold leading-none tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        <span className="block text-xs text-charcoal-light mt-1.5 leading-tight">
          {label}
        </span>
        {hint && (
          <span className="block text-[10px] text-charcoal-light/70 mt-0.5">{hint}</span>
        )}
      </span>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

function HealthChip({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-3 py-1.5 ${
        ok
          ? "bg-green-50 text-green-700 border-green-200"
          : warn
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-neutral-bg text-charcoal-light border-neutral-border"
      }`}
    >
      {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {label}
    </span>
  );
}

export default async function OverviewPage() {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  // All metrics are real database aggregates — never fabricated.
  const [
    totalProducts,
    publishedProducts,
    totalCustomers,
    activeOffers,
    productsOnOffer,
    newRfqs,
    totalRfqs,
    pendingQuotations,
    sentQuotations,
    acceptedQuotations,
    activeCampaigns,
    messagesSent,
    templateRow,
    recentRfqs,
  ] = await Promise.all([
    count(supabase, "products"),
    count(supabase, "products", (q) => q.eq("visibility", "published")),
    count(supabase, "customers"),
    count(supabase, "offers", (q) => q.eq("status", "active")),
    count(supabase, "active_offer_products"),
    count(supabase, "rfqs", (q) => q.eq("status", "new")),
    count(supabase, "rfqs"),
    count(supabase, "quotations", (q) =>
      q.in("status", ["new", "assigned", "under_review", "prepared", "approved"]),
    ),
    count(supabase, "quotations", (q) => q.eq("status", "sent")),
    count(supabase, "quotations", (q) => q.in("status", ["accepted", "completed"])),
    count(supabase, "campaigns", (q) => q.in("status", ["scheduled", "running"])),
    count(supabase, "message_logs", (q) => q.eq("direction", "outbound")),
    supabase
      .from("message_templates")
      .select("status")
      .eq("name", respondIoConfig.templateName())
      .limit(1)
      .then(({ data }) => data?.[0] ?? null),
    supabase
      .from("rfqs")
      .select("id, reference, status, created_at, customers(name)")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => data ?? []),
  ]);

  const decided = sentQuotations + acceptedQuotations;
  const conversionRate =
    decided > 0 ? `${Math.round((acceptedQuotations / decided) * 100)}%` : "—";

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header + quick actions */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-charcoal-light">{today}</p>
          <h1 className="display text-[26px] font-black mt-0.5">
            Sales Command Center
          </h1>
          <p className="text-sm text-charcoal-light mt-1">
            Welcome back, {profile.full_name.split(" ")[0]}.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {hasPermission(profile, "offers.write") && (
            <Link
              href="/dashboard/offers/new"
              className="inline-flex items-center gap-1.5 text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded-lg px-4 py-2 shadow-sm"
            >
              <Plus size={15} /> New Offer
            </Link>
          )}
          {hasPermission(profile, "campaigns.write") && (
            <Link
              href="/dashboard/broadcasting/new"
              className="inline-flex items-center gap-1.5 text-sm bg-charcoal hover:bg-black text-white font-semibold rounded-lg px-4 py-2 shadow-sm"
            >
              <Megaphone size={15} /> New Campaign
            </Link>
          )}
          {hasPermission(profile, "rfqs.write") && (
            <Link
              href="/dashboard/rfqs/new"
              className="inline-flex items-center gap-1.5 text-sm border border-neutral-border bg-white hover:border-charcoal-light/40 rounded-lg px-4 py-2"
            >
              <Plus size={15} /> Manual RFQ
            </Link>
          )}
        </div>
      </div>

      {/* Integration health */}
      <div className="flex gap-2 flex-wrap">
        <HealthChip ok label="Supabase connected" />
        <HealthChip
          ok={Boolean(respondIoConfig.token())}
          warn
          label={respondIoConfig.token() ? "Respond.io configured" : "Respond.io token missing"}
        />
        <HealthChip
          ok={isQueueConfigured()}
          warn
          label={isQueueConfigured() ? "Worker queue configured" : "Redis not configured"}
        />
        <HealthChip
          ok={templateRow?.status === "approved"}
          warn
          label={`Template ${respondIoConfig.templateName()}: ${templateRow?.status ?? "unknown"}`}
        />
        <HealthChip
          ok={isLiveBroadcastingEnabled()}
          label={isLiveBroadcastingEnabled() ? "Live broadcasting ENABLED" : "Live broadcasting off (safe)"}
        />
      </div>

      {/* Catalog & customers */}
      <section>
        <h2 className="text-[11px] font-semibold text-charcoal-light uppercase tracking-[0.1em] mb-2.5">
          Catalog & Customers
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Products"
            value={totalProducts}
            hint={`${publishedProducts.toLocaleString()} published`}
            icon={Package}
            href="/dashboard/products"
          />
          <KpiCard
            label="Active offers"
            value={activeOffers}
            hint={`${productsOnOffer.toLocaleString()} products on offer`}
            icon={BadgePercent}
            tone="red"
            href="/dashboard/offers"
          />
          <KpiCard
            label="Customers"
            value={totalCustomers}
            icon={Users}
            tone="blue"
            href="/dashboard/customers"
          />
          <KpiCard
            label="Messages sent"
            value={messagesSent}
            icon={MessageSquareText}
            tone="green"
            href="/dashboard/message-history"
          />
        </div>
      </section>

      {/* Sales pipeline */}
      <section>
        <h2 className="text-[11px] font-semibold text-charcoal-light uppercase tracking-[0.1em] mb-2.5">
          Sales Pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard
            label="New requests"
            value={newRfqs}
            tone={newRfqs > 0 ? "red" : "neutral"}
            icon={Inbox}
            href="/dashboard/rfqs"
          />
          <KpiCard
            label="Total requests"
            value={totalRfqs}
            icon={Inbox}
            href="/dashboard/rfqs"
          />
          <KpiCard
            label="Quotations in progress"
            value={pendingQuotations}
            tone="amber"
            icon={FileText}
            href="/dashboard/quotations"
          />
          <KpiCard
            label="Quotations sent"
            value={sentQuotations}
            tone="blue"
            icon={FileText}
            href="/dashboard/quotations"
          />
          <KpiCard
            label="Conversion rate"
            value={conversionRate}
            hint={`${acceptedQuotations.toLocaleString()} accepted`}
            tone="green"
            icon={TrendingUp}
            href="/dashboard/reports"
          />
        </div>
      </section>

      {/* Marketing + recent requests */}
      <div className="grid md:grid-cols-3 gap-4">
        <section>
          <h2 className="text-[11px] font-semibold text-charcoal-light uppercase tracking-[0.1em] mb-2.5">
            Marketing
          </h2>
          <KpiCard
            label="Scheduled / running campaigns"
            value={activeCampaigns}
            icon={Megaphone}
            href="/dashboard/broadcasting"
          />
        </section>

        <section className="md:col-span-2">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[11px] font-semibold text-charcoal-light uppercase tracking-[0.1em]">
              Latest Quotation Requests
            </h2>
            <Link
              href="/dashboard/rfqs"
              className="text-xs text-tronic-red hover:underline inline-flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="bg-white border border-neutral-border rounded-xl overflow-hidden">
            {recentRfqs.length === 0 ? (
              <div className="py-10 text-center">
                <Inbox size={28} className="mx-auto text-neutral-border" strokeWidth={1.5} />
                <p className="text-sm text-charcoal-light mt-2">
                  No quotation requests yet — they appear here the moment a
                  customer submits one.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-border">
                {recentRfqs.map((r) => {
                  const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
                  return (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/rfqs/${r.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-neutral-bg transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">
                          {(customer as { name?: string } | null)?.name || "Unknown customer"}
                        </span>
                        <span className="block text-xs text-charcoal-light font-mono">
                          {r.reference}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-xs border border-neutral-border rounded-full px-2.5 py-0.5 capitalize bg-neutral-bg">
                          {String(r.status).replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] text-charcoal-light">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
