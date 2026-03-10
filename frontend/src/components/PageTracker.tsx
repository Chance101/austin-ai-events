'use client';

import { useEffect, useRef } from 'react';

interface PageTrackerProps {
  page: string;
}

export default function PageTracker({ page }: PageTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;

    // Skip if already tracked in the last 24 hours
    if (document.cookie.includes('_pv_tracked=1')) {
      tracked.current = true;
      return;
    }

    tracked.current = true;

    const trackVisit = async () => {
      try {
        await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page }),
        });
        // Set 24-hour cookie to prevent re-tracking
        document.cookie = '_pv_tracked=1; max-age=86400; path=/; SameSite=Lax';
      } catch {
        // Silent fail
      }
    };

    trackVisit();
  }, [page]);

  return null;
}
