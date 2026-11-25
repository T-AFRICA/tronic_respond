import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + route protection.
 * - /dashboard/** requires a signed-in staff member.
 * - /login redirects signed-in users to the dashboard.
 * - /api/webhooks/** is excluded (authenticated by provider signature, not cookies).
 * - /catalog/** (optional external customer catalog) is public.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Fail with a precise message instead of a generic 500 when the deployment
  // is missing its Supabase configuration.
  const missing = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    return new NextResponse(
      `TRONIC Response is not configured: missing environment variable(s) ${missing.join(
        ", ",
      )}. Add them in the hosting provider's project settings and redeploy.`,
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: object }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // A transient Supabase outage must not take down public pages: treat
  // failures as "signed out" (protected routes then redirect to /login).
  let user: unknown = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error(
      "middleware: supabase.auth.getUser failed:",
      e instanceof Error ? e.message : e,
    );
  }

  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/dashboard");
  const isAuthPage = pathname === "/login";

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and webhook endpoints
    "/((?!_next/static|_next/image|favicon.ico|fonts|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
