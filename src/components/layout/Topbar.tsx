import { logout } from "@/app/login/actions";

export function Topbar({ name, roleName }: { name: string; roleName: string }) {
  return (
    <header className="h-14 bg-white border-b border-neutral-border flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium leading-tight">{name}</p>
          <p className="text-xs text-charcoal-light leading-tight">{roleName}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-charcoal-light hover:text-tronic-red border border-neutral-border rounded px-3 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
