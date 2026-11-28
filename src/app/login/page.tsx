import {
  Mail,
  ShieldCheck,
  MessageCircle,
  FileText,
  Megaphone,
} from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { login } from "./actions";

export const metadata = { title: "Staff Sign In" };

const FEATURES = [
  {
    icon: Megaphone,
    title: "WhatsApp broadcasting",
    text: "Approved campaigns with delivery tracking",
  },
  {
    icon: FileText,
    title: "Quotations",
    text: "RFQ to approved PDF, sent in one click",
  },
  {
    icon: MessageCircle,
    title: "Catalog & orders",
    text: "Live product catalog synced to WhatsApp",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  const input =
    "w-full rounded-xl border border-neutral-border bg-neutral-bg/50 pl-9 pr-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-tronic-red/25 focus:border-tronic-red/50 focus:bg-white";

  return (
    <main className="min-h-screen flex bg-neutral-bg">
      {/* Brand panel (desktop) */}
      <aside className="hidden lg:flex w-[44%] bg-[#141416] text-white flex-col justify-between p-10 relative overflow-hidden">
        {/* Ambient brand glow */}
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(600px circle at 15% 15%, #d6001c 0, transparent 55%), radial-gradient(700px circle at 90% 95%, #d6001c 0, transparent 55%)",
          }}
        />
        {/* Fine grid texture */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="bg-white rounded-lg px-3 py-2 inline-flex items-center shadow-[0_4px_20px_rgba(214,0,28,0.25)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/tronic-logo.webp" alt="TRONIC" className="h-6 w-auto" />
          </span>
          <span className="font-light text-lg text-white/90 tracking-wide">
            Response
          </span>
        </div>

        <div className="relative max-w-sm space-y-8">
          <div>
            <span className="inline-block h-1 w-10 bg-tronic-red rounded-full mb-5" />
            <h2 className="display font-black text-[32px] leading-tight">
              Faster Responses.
              <br />
              <span className="text-tronic-red">Smarter Sales.</span>
            </h2>
            <p className="text-sm text-white/55 mt-4 leading-relaxed">
              Product offers, WhatsApp broadcasting and quotations — one
              command center for the TRONIC sales team.
            </p>
          </div>

          <ul className="space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.07] border border-white/10 text-tronic-red shrink-0">
                  <f.icon size={15} />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-white/90">
                    {f.title}
                  </span>
                  <span className="block text-xs text-white/45">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-white/35">
          © {new Date().getFullYear()} TRONIC · Internal sales platform
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex-1 flex items-center justify-center px-4 py-10 relative overflow-hidden">
        {/* Soft backdrop accent behind the card */}
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(520px circle at 50% 42%, rgba(214,0,28,0.05) 0, transparent 70%)",
          }}
        />
        <div className="w-full max-w-sm relative">
          <div className="mb-8 text-center lg:hidden">
            <div className="inline-flex items-baseline gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/tronic-logo.webp"
                alt="TRONIC"
                className="h-8 w-auto inline-block"
              />
              <span className="text-2xl font-light text-charcoal">Response</span>
            </div>
            <p className="mt-2 text-sm text-charcoal-light">
              Faster Responses. Smarter Sales.
            </p>
          </div>

          <form
            action={login}
            className="bg-white border border-neutral-border rounded-2xl p-8 space-y-5 shadow-[0_18px_50px_rgba(0,0,0,0.09)] relative overflow-hidden"
          >
            {/* Top brand accent */}
            <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-tronic-red via-tronic-red to-tronic-red/40" />

            <div>
              <h1 className="text-[22px] font-bold tracking-tight">
                Staff Sign In
              </h1>
              <p className="text-xs text-charcoal-light mt-1">
                Sign in with your TRONIC staff account.
              </p>
            </div>

            {params.error && (
              <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded-lg px-3 py-2">
                {params.error === "invalid"
                  ? "Invalid email or password."
                  : "Sign-in failed. Please try again."}
              </p>
            )}

            <input type="hidden" name="next" value={params.next ?? ""} />

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-charcoal-light mb-1.5 uppercase tracking-wide"
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light/50 pointer-events-none"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@tronic.co.tz"
                  className={input}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-charcoal-light mb-1.5 uppercase tracking-wide"
              >
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                withLockIcon
                className={input}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold py-3 text-sm transition-all shadow-[0_6px_20px_rgba(214,0,28,0.35)] hover:shadow-[0_8px_26px_rgba(214,0,28,0.45)] hover:-translate-y-px"
            >
              Sign In
            </button>

            <p className="text-[11px] text-charcoal-light text-center flex items-center justify-center gap-1.5">
              <ShieldCheck size={13} className="text-green-700" />
              Staff accounts are created by an administrator.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
