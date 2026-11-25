import { requireProfile } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
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
    <div className="min-h-screen flex">
      <Sidebar permissions={profile.permissions} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          name={profile.full_name}
          roleName={profile.role_name}
          notifications={(notifications ?? []) as NotificationItem[]}
          unreadCount={unreadRes.count ?? 0}
        />
        <main className="flex-1 p-6 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
