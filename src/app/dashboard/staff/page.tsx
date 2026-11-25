import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff Management" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requirePermission("staff.manage");
  const supabase = await createSupabaseServerClient();

  const { data: staff } = await supabase
    .from("profiles")
    .select("*, roles(name)")
    .order("full_name");

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="display text-2xl font-black">Staff Management</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Staff accounts are provisioned in Supabase Auth; each account needs a
          profile row with a role. Invite flows ship with Phase 1A completion.
        </p>
      </div>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-charcoal-light py-8">
                  No staff profiles yet. Create the first Super Admin with the
                  seed script (see README).
                </td>
              </tr>
            )}
            {(staff ?? []).map((s) => {
              const role = Array.isArray(s.roles) ? s.roles[0] : s.roles;
              return (
                <tr key={s.id}>
                  <td className="font-medium">{s.full_name}</td>
                  <td>{s.email}</td>
                  <td>{role?.name ?? "—"}</td>
                  <td>
                    <span
                      className={`text-[11px] border rounded-full px-2 py-0.5 ${
                        s.is_active
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-neutral-bg text-charcoal-light border-neutral-border"
                      }`}
                    >
                      {s.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
