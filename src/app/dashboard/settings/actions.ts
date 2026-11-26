"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

const MIN_PASSWORD_LENGTH = 10;

function back(qs: string): never {
  redirect(`/dashboard/settings?${qs}`);
}

/**
 * Change the signed-in staff member's own password.
 * No current-password check: the signed-in session itself is the proof of
 * identity (product decision — staff often reset before memorizing).
 */
export async function changeOwnPassword(formData: FormData) {
  const profile = await requirePermission("settings.manage");

  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < MIN_PASSWORD_LENGTH) back("pw_error=too_short");
  if (next !== confirm) back("pw_error=mismatch");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) back(`pw_error=${encodeURIComponent(error.message)}`);

  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "auth.password_changed",
    entity_type: "profile",
    entity_id: profile.id,
  });

  revalidatePath("/dashboard/settings");
  back("pw=changed");
}

/**
 * Super Admin: set a new password for a staff member.
 * Requires staff.manage. The password itself is never logged.
 */
export async function resetStaffPassword(formData: FormData) {
  const profile = await requirePermission("staff.manage");

  const targetId = String(formData.get("staff_id") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!targetId) back("staffpw_error=no_staff");
  if (next.length < MIN_PASSWORD_LENGTH) back("staffpw_error=too_short");
  if (next !== confirm) back("staffpw_error=mismatch");

  const admin = createSupabaseAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", targetId)
    .single();
  if (!target) back("staffpw_error=not_found");

  const { error } = await admin.auth.admin.updateUserById(targetId, {
    password: next,
  });
  if (error) back(`staffpw_error=${encodeURIComponent(error.message)}`);

  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "auth.staff_password_reset",
    entity_type: "profile",
    entity_id: targetId,
    after: { staff_email: target.email },
  });

  revalidatePath("/dashboard/settings");
  back(`staffpw=changed&name=${encodeURIComponent(target.full_name ?? target.email)}`);
}
