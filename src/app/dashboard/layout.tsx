import { requireProfile } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen flex">
      <Sidebar permissions={profile.permissions} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar name={profile.full_name} roleName={profile.role_name} />
        <main className="flex-1 p-6 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
