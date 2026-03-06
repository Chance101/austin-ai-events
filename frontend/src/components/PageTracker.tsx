'use client';

import { useEffect, useState } from 'react';

interface PageTrackerProps {
  page: string;
}

export default function PageTracker({ page }: PageTrackerProps) {
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (tracked) return;

    // Skip if already tracked in the last 24 hours
    if (document.cookie.includes('_pv_tracked=1')) {
      setTracked(true);
      return;
    }

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
      setTracked(true);
    };

    trackVisit();
  }, [tracked, page]);

  return null;
}
