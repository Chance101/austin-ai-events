'use client';

import { useEffect, useState } from 'react';

interface PageTrackerProps {
  page: string;
}

export default function PageTracker({ page }: PageTrackerProps) {
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (tracked) return;

    const trackVisit = async () => {
      try {
        await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page }),
        });
      } catch {
        // Silent fail
      }
      setTracked(true);
    };

    trackVisit();
  }, [tracked, page]);

  return null;
}
