import { Lock, Mail, ShieldCheck } from "lucide-react";
import { login } from "./actions";

export const metadata = { title: "Staff Sign In" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen flex bg-neutral-bg">
      {/* Brand panel (desktop) */}
      <aside className="hidden lg:flex w-[44%] bg-[#1d1d1f] text-white flex-col justify-between p-10 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #d6001c 0, transparent 40%), radial-gradient(circle at 80% 90%, #d6001c 0, transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-lg bg-tronic-red flex items-center justify-center display font-black text-xl shadow-[0_2px_12px_rgba(214,0,28,0.5)]">
            T
          </span>
          <span>
            <span className="display font-black text-lg">TRONIC</span>
            <span className="font-light text-lg"> Response</span>
          </span>
        </div>

        <div className="relative max-w-sm">
          <h2 className="display font-black text-[28px] leading-snug">
            Faster Responses.
            <br />
            <span className="text-tronic-red">Smarter Sales.</span>
          </h2>
          <p className="text-sm text-white/60 mt-4 leading-relaxed">
            Product offers, WhatsApp broadcasting and quotations — one command
            center for the TRONIC sales team.
          </p>
        </div>

        <p className="relative text-[11px] text-white/35">
          © {new Date().getFullYear()} TRONIC · Internal sales platform
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="inline-flex items-baseline gap-1">
              <span className="display text-3xl font-black text-tronic-red">TRONIC</span>
              <span className="text-3xl font-light text-charcoal">Response</span>
            </div>
            <p className="mt-2 text-sm text-charcoal-light">
              Faster Responses. Smarter Sales.
            </p>
          </div>

          <form
            action={login}
            className="bg-white border border-neutral-border rounded-2xl p-7 space-y-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
          >
            <div>
              <h1 className="text-xl font-bold">Staff Sign In</h1>
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
                  className="w-full rounded-lg border border-neutral-border pl-9 pr-3 py-2.5 text-sm focus:outline-none"
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
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light/50 pointer-events-none"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-neutral-border pl-9 pr-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold py-2.5 text-sm transition-colors shadow-[0_2px_10px_rgba(214,0,28,0.3)]"
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
