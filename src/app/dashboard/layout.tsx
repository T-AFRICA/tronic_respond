import { requireProfile } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Shell } from "@/components/layout/Shell";
import type { NotificationItem } from "@/components/layout/NotificationsBell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const [{ data: notifications }, unreadRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link, is_read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_read", false),
  ]);

  return (
    <Shell
      permissions={profile.permissions}
      name={profile.full_name}
      roleName={profile.role_name}
      notifications={(notifications ?? []) as NotificationItem[]}
      unreadCount={unreadRes.count ?? 0}
    >
      {children}
    </Shell>
  );
}
