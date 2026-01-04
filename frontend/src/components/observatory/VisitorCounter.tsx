'use client';

import { useState, useEffect } from 'react';

interface Counts {
  humanCount: number;
  botCount: number;
}

function formatCount(num: number): string {
  return num.toString().padStart(6, '0');
}

export default function VisitorCounter() {
  const [counts, setCounts] = useState<Counts>({ humanCount: 0, botCount: 0 });
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (tracked) return;

    const trackVisit = async () => {
      try {
        const response = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 'observatory' }),
        });

        if (response.ok) {
          const data = await response.json();
          setCounts({
            humanCount: data.humanCount,
            botCount: data.botCount,
          });
        }
      } catch (error) {
        console.error('Failed to track visit:', error);
      }
      setTracked(true);
    };

    trackVisit();
  }, [tracked]);

  return (
    <div className="flex justify-center">
      <div
        className="inline-flex items-center gap-6 px-6 py-4 rounded-lg"
        style={{
          background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.3)',
          border: '2px solid #3a3a3a',
        }}
      >
        {/* Human Counter */}
        <div className="flex items-center gap-3">
          <span className="text-xl">👤</span>
          <div className="flex flex-col items-center">
            <span
              className="font-mono text-xl tracking-wider"
              style={{
                color: '#4ade80',
                textShadow: '0 0 10px rgba(74, 222, 128, 0.5)',
                fontFamily: "'Courier New', monospace",
                fontWeight: 'bold',
              }}
            >
              {formatCount(counts.humanCount)}
            </span>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">
              Visitors
            </span>
          </div>
        </div>

        {/* Divider */}
        <div
          className="w-px h-10"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, #4a4a4a 50%, transparent 100%)',
          }}
        />

        {/* Bot Counter */}
        <div className="flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <div className="flex flex-col items-center">
            <span
              className="font-mono text-xl tracking-wider"
              style={{
                color: '#60a5fa',
                textShadow: '0 0 10px rgba(96, 165, 250, 0.5)',
                fontFamily: "'Courier New', monospace",
                fontWeight: 'bold',
              }}
            >
              {formatCount(counts.botCount)}
            </span>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">
              AI Crawlers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
