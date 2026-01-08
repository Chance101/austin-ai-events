'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { DailyStats } from '@/types/observatory';

interface PerformanceChartProps {
  data: DailyStats[];
  loading: boolean;
}

export default function PerformanceChart({ data, loading }: PerformanceChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateLabel: format(parseISO(d.date), 'MMM d'),
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Events Added (Last 30 Days)</h3>
        <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"></div>
      </div>
    );
  }

  const totalEvents = data.reduce((sum, d) => sum + d.events_added, 0);
  const avgPerDay = data.length > 0 ? (totalEvents / data.length).toFixed(1) : '0';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Events Added (Last 30 Days)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Daily event additions from agent runs</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalEvents}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{avgPerDay}/day avg</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
          No data available yet
        </div>
      ) : (
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 12 }}
                tickLine={false}
                className="text-gray-500 dark:text-gray-400"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                allowDecimals={false}
                className="text-gray-500 dark:text-gray-400"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--foreground)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--foreground)',
                }}
                formatter={(value) => [`${value ?? 0} events`, 'Added']}
                labelFormatter={(label) => label}
              />
              <Area
                type="monotone"
                dataKey="events_added"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorEvents)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 text-center">
        Tracking since January 3, 2026
      </p>
    </div>
  );
}
