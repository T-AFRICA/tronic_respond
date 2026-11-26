import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { changeOwnPassword, resetStaffPassword } from "./actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const PW_ERRORS: Record<string, string> = {
  too_short: "The new password must be at least 10 characters.",
  mismatch: "The two password fields don't match.",
};

const STAFFPW_ERRORS: Record<string, string> = {
  no_staff: "Choose a staff member first.",
  too_short: "The new password must be at least 10 characters.",
  mismatch: "The two password fields don't match.",
  not_found: "That staff member no longer exists.",
};

const INPUT =
  "w-full rounded-[7px] border border-neutral-border bg-white px-3 py-2 text-sm";
const LABEL = "block text-[12.5px] text-[var(--ink-muted)] mb-1";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pw?: string;
    pw_error?: string;
    staffpw?: string;
    staffpw_error?: string;
    name?: string;
  }>;
}) {
  const profile = await requirePermission("settings.manage");
  const sp = await searchParams;
  const canManageStaff = hasPermission(profile, "staff.manage");

  const { data: staff } = canManageStaff
    ? await createSupabaseAdminClient()
        .from("profiles")
        .select("id, full_name, email, is_active")
        .order("full_name")
    : { data: null };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="display text-2xl font-black">Settings</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Account security and application defaults.
        </p>
      </div>

      {/* ---------- Change my password ---------- */}
      <div className="bg-white border border-neutral-border rounded-lg p-5">
        <p className="text-[15px] font-bold">Change my password</p>
        <p className="text-[12.5px] text-[var(--ink-muted)] mt-0.5 mb-4">
          Signed in as {profile.email}. You stay signed in after the change.
        </p>

        {sp.pw === "changed" && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-4">
            Password updated.
          </p>
        )}
        {sp.pw_error && (
          <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2 mb-4">
            {PW_ERRORS[sp.pw_error] ?? sp.pw_error}
          </p>
        )}

        <form action={changeOwnPassword} className="space-y-3 max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="new_password">
                New password
              </label>
              <PasswordInput
                id="new_password"
                name="new_password"
                required
                minLength={10}
                autoComplete="new-password"
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="confirm_password">
                Confirm new password
              </label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                required
                minLength={10}
                autoComplete="new-password"
                className={INPUT}
              />
            </div>
          </div>
          <p className="text-[12px] text-[var(--ink-faint)]">
            At least 10 characters. Use a mix of letters, numbers and symbols.
          </p>
          <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
            Update password
          </button>
        </form>
      </div>

      {/* ---------- Reset a staff member's password ---------- */}
      {canManageStaff && (
        <div className="bg-white border border-neutral-border rounded-lg p-5">
          <p className="text-[15px] font-bold">Reset a staff password</p>
          <p className="text-[12.5px] text-[var(--ink-muted)] mt-0.5 mb-4">
            Sets a new password for the selected staff member immediately.
            Share it with them privately and ask them to change it here after
            signing in.
          </p>

          {sp.staffpw === "changed" && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-4">
              Password updated for {sp.name ?? "the staff member"}.
            </p>
          )}
          {sp.staffpw_error && (
            <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2 mb-4">
              {STAFFPW_ERRORS[sp.staffpw_error] ?? sp.staffpw_error}
            </p>
          )}

          <form action={resetStaffPassword} className="space-y-3 max-w-md">
            <div>
              <label className={LABEL} htmlFor="staff_id">
                Staff member
              </label>
              <select id="staff_id" name="staff_id" required className={INPUT}>
                <option value="">Choose…</option>
                {(staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? s.email}
                    {s.id === profile.id ? " (you)" : ""}
                    {s.is_active ? "" : " — inactive"}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="staff_new_password">
                  New password
                </label>
                <PasswordInput
                  id="staff_new_password"
                  name="new_password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="staff_confirm_password">
                  Confirm new password
                </label>
                <PasswordInput
                  id="staff_confirm_password"
                  name="confirm_password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className={INPUT}
                />
              </div>
            </div>
            <button className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-4 py-2">
              Reset staff password
            </button>
          </form>
        </div>
      )}

      {/* ---------- Application info ---------- */}
      <div className="bg-white border border-neutral-border rounded-lg p-5 text-sm space-y-3">
        <div>
          <p className="font-medium">Application</p>
          <p className="text-charcoal-light">
            Default currency: {process.env.DEFAULT_CURRENCY ?? "TZS"} · Country
            scope: Tanzania (country-aware schema ready for expansion).
          </p>
        </div>
        <div>
          <p className="font-medium">Security</p>
          <p className="text-charcoal-light">
            Role-based access control is enforced in the API layer and via
            Supabase Row Level Security. Integration credentials are stored as
            environment variables — never in code. Password changes are
            recorded in the audit log (never the password itself).
          </p>
        </div>
      </div>
    </div>
  );
}
