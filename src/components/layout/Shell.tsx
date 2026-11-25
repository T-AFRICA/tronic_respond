"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { NotificationItem } from "@/components/layout/NotificationsBell";

/**
 * Dashboard chrome: desktop = fixed sidebar; mobile (< lg) = off-canvas
 * drawer opened from the Topbar hamburger, with a backdrop.
 */
export function Shell({
  permissions,
  name,
  roleName,
  notifications,
  unreadCount,
  children,
}: {
  permissions: string[];
  name: string;
  roleName: string;
  notifications: NotificationItem[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Backdrop (mobile drawer) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        permissions={permissions}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          name={name}
          roleName={roleName}
          notifications={notifications}
          unreadCount={unreadCount}
          onMenuClick={() => setMobileOpen(true)}
        />
        {/* Near-white surface: white cards keep visible depth against it */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto bg-[#fafaf9]">
          {children}
        </main>
      </div>
    </div>
  );
}
