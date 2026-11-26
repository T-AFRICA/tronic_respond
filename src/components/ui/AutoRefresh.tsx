"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While `active`, re-fetches the server component data on an interval so
 * live statuses (queued → running → completed) update without a manual
 * refresh. Renders nothing; stops automatically when `active` turns false.
 */
export function AutoRefresh({
  active,
  intervalMs = 2500,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
