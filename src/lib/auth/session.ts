import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

export type StaffProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role_id: number;
  role_key: AppRole;
  role_name: string;
  permissions: string[];
  country_id: number;
  is_active: boolean;
};

/**
 * Current signed-in staff profile with role + permissions.
 * Cached per request. Returns null when not signed in or profile missing.
 */
export const getCurrentProfile = cache(
  async (): Promise<StaffProfile | null> => {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // One round-trip: profile + role + permissions via nested select
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, role_id, country_id, is_active, roles(key, name, role_permissions(permissions(key)))",
      )
      .eq("id", user.id)
      .single();

    if (!profile || !profile.is_active) return null;

    const role = Array.isArray(profile.roles)
      ? profile.roles[0]
      : profile.roles;
    const rolePerms =
      (
        role as {
          role_permissions?: {
            permissions: { key: string } | { key: string }[] | null;
          }[];
        } | null
      )?.role_permissions ?? [];

    return {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      role_id: profile.role_id,
      role_key: (role?.key ?? "sales_staff") as AppRole,
      role_name: role?.name ?? "",
      permissions: rolePerms
        .map((rp) => {
          const perm = Array.isArray(rp.permissions)
            ? rp.permissions[0]
            : rp.permissions;
          return perm?.key as string;
        })
        .filter(Boolean),
      country_id: profile.country_id,
      is_active: profile.is_active,
    };
  },
);

/** Redirects to /login when unauthenticated. */
export async function requireProfile(): Promise<StaffProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Redirects to /dashboard when the permission is missing (server-side guard). */
export async function requirePermission(perm: string): Promise<StaffProfile> {
  const profile = await requireProfile();
  if (!profile.permissions.includes(perm)) redirect("/dashboard?denied=1");
  return profile;
}

export function hasPermission(profile: StaffProfile, perm: string): boolean {
  return profile.permissions.includes(perm);
}
