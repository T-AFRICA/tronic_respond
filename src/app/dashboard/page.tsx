import Link from "next/link";
import {
  Package,
  Users,
  BadgePercent,
  Inbox,
  FileText,
  Megaphone,
  MessageSquareText,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
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
  tone?: "neutral" | "red" | "green" | "blue";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-bg text-charcoal-light",
    red: "bg-tronic-red-soft text-tronic-red",
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
  };
  const body = (
    <div className="bg-white border border-neutral-border rounded-xl px-5 py-4 flex items-center gap-4 h-full transition-all hover:border-tronic-red/30 hover:shadow-[0_2px_10px_rgba(214,0,28,0.07)]">
      <span className={`w-11 h-11 rounded-[10px] ${tones[tone]} flex items-center justify-center shrink-0`}>
        <Icon size={21} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[28px] font-bold leading-none tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5 leading-snug">
          {label}
        </span>
        {hint && (
          <span className="block text-[11px] text-[var(--ink-faint)] mt-0.5">{hint}</span>
        )}
      </span>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** Pipeline stage for the funnel visual. */
function FunnelStage({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  const countInside = pct >= 14;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 sm:w-44 shrink-0 text-[13px] text-[var(--ink-muted)]">
        {label}
      </div>
      <div className="flex-1 h-8 bg-neutral-bg rounded-md overflow-hidden flex items-center">
        <div
          className={`h-full rounded-md ${tone} transition-[width] duration-700 ease-out flex items-center justify-end pr-2.5 shrink-0`}
          style={{ width: `${pct}%` }}
        >
          {countInside && (
            <span className="text-[12px] font-bold text-white tabular-nums">
              {value.toLocaleString()}
            </span>
          )}
        </div>
        {!countInside && (
          <span className="pl-2 text-[12.5px] font-semibold text-[var(--ink-muted)] tabular-nums">
            {value.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

function ReadinessRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
      {ok ? (
        <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
      ) : (
        <Clock size={16} className="text-amber-500 mt-0.5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className={`block text-[13.5px] leading-snug ${ok ? "" : "font-medium"}`}>
          {label}
        </span>
        {hint && (
          <span className="block text-[12px] text-[var(--ink-faint)] mt-0.5">{hint}</span>
        )}
      </span>
    </li>
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
    suppressedCustomers,
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
    allowlistRow,
    recentRfqs,
  ] = await Promise.all([
    count(supabase, "products"),
    count(supabase, "products", (q) => q.eq("visibility", "published")),
    count(supabase, "customers"),
    count(supabase, "customers", (q) => q.eq("is_blocked", true)),
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
      .from("system_settings")
      .select("value")
      .eq("key", "test_whatsapp_allowlist")
      .single()
      .then(({ data }) => data),
    supabase
      .from("rfqs")
      .select("id, reference, status, created_at, customers(name)")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => data ?? []),
  ]);

  const reachable = Math.max(0, totalCustomers - suppressedCustomers);
  const allowlistCount = Array.isArray(allowlistRow?.value)
    ? (allowlistRow.value as unknown[]).length
    : 0;
  const templateApproved = templateRow?.status === "approved";
  const funnelMax = Math.max(
    totalRfqs,
    pendingQuotations,
    sentQuotations,
    acceptedQuotations,
    1,
  );
  const decided = sentQuotations + acceptedQuotations;
  const conversionRate =
    decided > 0 ? Math.round((acceptedQuotations / decided) * 100) : null;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6 max-w-[1240px]">
      {/* Header + quick actions */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-[var(--ink-faint)]">{today}</p>
          <h1 className="display text-[30px] font-black mt-1 leading-tight">
            Sales Command Center
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {hasPermission(profile, "offers.write") && (
            <Link
              href="/dashboard/offers/new"
              className="inline-flex items-center gap-1.5 text-[13.5px] bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded-lg px-4 py-2.5"
            >
              <Plus size={16} /> New Offer
            </Link>
          )}
          {hasPermission(profile, "campaigns.write") && (
            <Link
              href="/dashboard/broadcasting/new"
              className="inline-flex items-center gap-1.5 text-[13.5px] bg-charcoal hover:bg-black text-white font-semibold rounded-lg px-4 py-2.5"
            >
              <Megaphone size={15} /> New Campaign
            </Link>
          )}
          {hasPermission(profile, "rfqs.write") && (
            <Link
              href="/dashboard/rfqs/new"
              className="inline-flex items-center gap-1.5 text-[13.5px] border border-neutral-border bg-white hover:border-charcoal-light/40 rounded-lg px-4 py-2.5"
            >
              <Plus size={16} /> Manual RFQ
            </Link>
          )}
        </div>
      </div>

      {/* HERO — the one loud element: WhatsApp reach, on brand charcoal */}
      <section className="relative overflow-hidden rounded-2xl bg-[#1b1b1e] text-white">
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 20%, #d6001c 0%, transparent 45%), radial-gradient(circle at 10% 110%, #d6001c 0%, transparent 35%)",
          }}
        />
        <div className="relative px-6 py-6 lg:px-8 lg:py-7 flex flex-wrap items-end gap-x-12 gap-y-5">
          <div>
            <p className="text-[13px] text-white/60">WhatsApp reach, right now</p>
            <p className="display text-[52px] leading-none font-black mt-2 tracking-tight">
              {reachable.toLocaleString()}
            </p>
            <p className="text-[14px] text-white/75 mt-2">
              customers reachable for the next campaign
            </p>
          </div>
          <div className="flex gap-10 flex-wrap">
            <div>
              <p className="text-[26px] font-bold leading-none">
                {productsOnOffer.toLocaleString()}
              </p>
              <p className="text-[13px] text-white/60 mt-1.5">products on live offer</p>
            </div>
            <div>
              <p className="text-[26px] font-bold leading-none">
                {activeOffers.toLocaleString()}
              </p>
              <p className="text-[13px] text-white/60 mt-1.5">active offers</p>
            </div>
            <div>
              <p className="text-[26px] font-bold leading-none">
                {messagesSent.toLocaleString()}
              </p>
              <p className="text-[13px] text-white/60 mt-1.5">messages sent to date</p>
            </div>
          </div>
          <Link
            href="/catalog/offers"
            className="ml-auto self-center inline-flex items-center gap-1.5 text-[13px] border border-white/25 hover:border-white/60 rounded-lg px-4 py-2 text-white/90"
          >
            View live catalog <ArrowRight size={14} />
          </Link>
        </div>
        {/* System status, quietly riding the hero footer */}
        <div className="relative border-t border-white/10 px-6 lg:px-8 py-2.5 flex gap-x-5 gap-y-1 flex-wrap text-[12px] text-white/55">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Supabase
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${respondIoConfig.token() ? "bg-green-400" : "bg-amber-400"}`}
            />
            Respond.io
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isQueueConfigured() ? "bg-green-400" : "bg-amber-400"}`}
            />
            Worker queue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${templateApproved ? "bg-green-400" : "bg-amber-400"}`}
            />
            Template {templateRow?.status ?? "unknown"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isLiveBroadcastingEnabled() ? "bg-green-400" : "bg-white/30"}`}
            />
            Live sends {isLiveBroadcastingEnabled() ? "enabled" : "off (safe)"}
          </span>
        </div>
      </section>

      {/* Catalog & customers */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          <KpiCard
            label="Products in catalog"
            value={totalProducts}
            hint={`${publishedProducts.toLocaleString()} published`}
            icon={Package}
            href="/dashboard/products"
          />
          <KpiCard
            label="Active offers"
            value={activeOffers}
            hint={`${productsOnOffer.toLocaleString()} products discounted`}
            icon={BadgePercent}
            tone="red"
            href="/dashboard/offers"
          />
          <KpiCard
            label="Customers synced"
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

      {/* Pipeline funnel + campaign readiness */}
      <div className="grid lg:grid-cols-3 gap-4 items-stretch">
        <section className="lg:col-span-2 bg-white border border-neutral-border rounded-xl p-5 lg:p-6">
          <div className="flex items-baseline justify-between gap-3 mb-5">
            <h2 className="text-[15px] font-bold">Sales pipeline</h2>
            <p className="text-[12.5px] text-[var(--ink-faint)]">
              {conversionRate !== null
                ? `${conversionRate}% of decided quotations accepted`
                : "Conversion shows after the first decided quotation"}
            </p>
          </div>
          <div className="space-y-3">
            <FunnelStage
              label="Quotation requests"
              value={totalRfqs}
              max={funnelMax}
              tone="bg-charcoal"
            />
            <FunnelStage
              label="Quotations in progress"
              value={pendingQuotations}
              max={funnelMax}
              tone="bg-charcoal/75"
            />
            <FunnelStage
              label="Quotations sent"
              value={sentQuotations}
              max={funnelMax}
              tone="bg-tronic-red/80"
            />
            <FunnelStage
              label="Accepted"
              value={acceptedQuotations}
              max={funnelMax}
              tone="bg-tronic-red"
            />
          </div>
          {totalRfqs === 0 && (
            <p className="text-[12.5px] text-[var(--ink-faint)] mt-4">
              The funnel fills as customers request quotations from the catalog
              or WhatsApp.{" "}
              {newRfqs === 0 && (
                <Link
                  href="/dashboard/rfqs/new"
                  className="text-tronic-red hover:underline"
                >
                  Record one manually
                </Link>
              )}
            </p>
          )}
        </section>

        <section className="bg-white border border-neutral-border rounded-xl p-5 lg:p-6">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-[15px] font-bold">Campaign readiness</h2>
            <span className="text-[12.5px] text-[var(--ink-faint)]">
              {activeCampaigns} scheduled
            </span>
          </div>
          <ul className="divide-y divide-[var(--hairline-soft)]">
            <ReadinessRow
              ok={activeOffers > 0}
              label={
                activeOffers > 0
                  ? "Offer live with verified prices"
                  : "Activate a verified offer"
              }
              hint={`${productsOnOffer.toLocaleString()} products ready to promote`}
            />
            <ReadinessRow
              ok={templateApproved}
              label={
                templateApproved
                  ? "WhatsApp template approved"
                  : "Awaiting Meta template approval"
              }
              hint={respondIoConfig.templateName()}
            />
            <ReadinessRow
              ok={allowlistCount > 0}
              label={
                allowlistCount > 0
                  ? `${allowlistCount} internal test numbers`
                  : "Add internal test numbers"
              }
              hint="Test sends only ever reach the allowlist"
            />
            <ReadinessRow
              ok={isQueueConfigured()}
              label={
                isQueueConfigured()
                  ? "Sending engine connected"
                  : "Connect the sending engine"
              }
              hint="Redis queue + background worker"
            />
          </ul>
          {hasPermission(profile, "campaigns.write") && (
            <Link
              href="/dashboard/broadcasting"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-tronic-red hover:underline"
            >
              Go to Broadcasting <ArrowRight size={14} />
            </Link>
          )}
        </section>
      </div>

      {/* Latest quotation requests */}
      <section className="bg-white border border-neutral-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 lg:px-6 pt-4 pb-3">
          <h2 className="text-[15px] font-bold">Latest quotation requests</h2>
          <Link
            href="/dashboard/rfqs"
            className="text-[13px] text-tronic-red hover:underline inline-flex items-center gap-1"
          >
            View all <ArrowRight size={13} />
          </Link>
        </div>
        {recentRfqs.length === 0 ? (
          <div className="px-6 pb-8 pt-2 text-center">
            <Inbox size={26} className="mx-auto text-neutral-border" strokeWidth={1.5} />
            <p className="text-[13.5px] text-[var(--ink-muted)] mt-2 max-w-md mx-auto">
              Requests land here the moment a customer submits one from the
              catalog or WhatsApp — the newest six, ready to assign.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hairline-soft)] border-t border-[var(--hairline)]">
            {recentRfqs.map((r) => {
              const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
              return (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/rfqs/${r.id}`}
                    className="flex items-center justify-between gap-3 px-5 lg:px-6 py-3 hover:bg-neutral-bg/60 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium truncate">
                        {(customer as { name?: string } | null)?.name ||
                          "Unknown customer"}
                      </span>
                      <span className="block text-[12px] text-[var(--ink-faint)] font-mono">
                        {r.reference}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] border border-neutral-border rounded-full px-2.5 py-0.5 capitalize bg-neutral-bg">
                        {String(r.status).replace(/_/g, " ")}
                      </span>
                      <span className="text-[12px] text-[var(--ink-faint)]">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <FileText size={14} className="text-neutral-border" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
