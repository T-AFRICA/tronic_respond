import { login } from "./actions";

export const metadata = { title: "Staff Sign In" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-baseline gap-1">
            <span className="display text-3xl font-black text-tronic-red">
              TRONIC
            </span>
            <span className="text-3xl font-light text-charcoal">Response</span>
          </div>
          <p className="mt-2 text-sm text-charcoal-light">
            Faster Responses. Smarter Sales.
          </p>
        </div>

        <form
          action={login}
          className="bg-white border border-neutral-border rounded-lg p-6 space-y-4"
        >
          <h1 className="text-lg font-semibold">Staff Sign In</h1>

          {params.error && (
            <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
              {params.error === "invalid"
                ? "Invalid email or password."
                : "Sign-in failed. Please try again."}
            </p>
          )}

          <input type="hidden" name="next" value={params.next ?? ""} />

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-charcoal-light mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded border border-neutral-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tronic-red/40 focus:border-tronic-red"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-charcoal-light mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded border border-neutral-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tronic-red/40 focus:border-tronic-red"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold py-2 text-sm transition-colors"
          >
            Sign In
          </button>

          <p className="text-xs text-charcoal-light text-center">
            Staff accounts are created by an administrator.
          </p>
        </form>
      </div>
    </main>
  );
}
