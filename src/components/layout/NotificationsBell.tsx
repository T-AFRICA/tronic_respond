"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { markAllNotificationsRead } from "@/app/dashboard/notification-actions";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationsBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg border border-neutral-border bg-white flex items-center justify-center text-charcoal-light hover:text-charcoal hover:border-charcoal-light/40 transition-colors"
        title="Notifications"
      >
        <Bell size={17} strokeWidth={1.9} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-tronic-red text-white text-[10px] font-bold flex items-center justify-center shadow">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-neutral-border rounded-xl shadow-xl z-30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-border bg-neutral-bg/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-light">
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                disabled={pending}
                onClick={() => startTransition(() => markAllNotificationsRead())}
                className="text-[11px] text-tronic-red hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-border">
            {notifications.length === 0 && (
              <p className="text-sm text-charcoal-light text-center py-8">
                Nothing yet — you&apos;re all caught up.
              </p>
            )}
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={n.link || "/dashboard"}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 hover:bg-neutral-bg transition-colors"
              >
                <span className="flex items-start gap-2">
                  {!n.is_read && (
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-tronic-red shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className={`block text-[13px] leading-snug ${n.is_read ? "text-charcoal-light" : "font-medium"}`}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-xs text-charcoal-light truncate">
                        {n.body}
                      </span>
                    )}
                    <span className="block text-[10px] text-charcoal-light/70 mt-0.5">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
