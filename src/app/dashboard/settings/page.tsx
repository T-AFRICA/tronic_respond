import { requirePermission } from "@/lib/auth/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="display text-2xl font-black">Settings</h1>

      <div className="bg-white border border-neutral-border rounded-lg p-5 text-sm space-y-3">
        <div>
          <p className="font-medium">Application</p>
          <p className="text-charcoal-light">
            Default currency: {process.env.DEFAULT_CURRENCY ?? "TZS"} · Country
            scope: Tanzania (country-aware schema ready for expansion).
          </p>
        </div>
        <div>
          <p className="font-medium">Quotation defaults</p>
          <p className="text-charcoal-light">
            Validity period, terms &amp; conditions templates and PDF branding
            settings are configured here in Phase 1D.
          </p>
        </div>
        <div>
          <p className="font-medium">Security</p>
          <p className="text-charcoal-light">
            Role-based access control is enforced in the API layer and via
            Supabase Row Level Security. Integration credentials are stored as
            environment variables / encrypted settings — never in code.
          </p>
        </div>
      </div>
    </div>
  );
}
