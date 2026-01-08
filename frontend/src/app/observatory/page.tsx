'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { AgentRun, Source, SearchQuery, DailyStats } from '@/types/observatory';
import { Event } from '@/types/event';
import HowItWorks from '@/components/observatory/HowItWorks';
import LastRunCard from '@/components/observatory/LastRunCard';
import ActivityFeed from '@/components/observatory/ActivityFeed';
import DiscoveryStats from '@/components/observatory/DiscoveryStats';
import LearningActivity from '@/components/observatory/LearningActivity';
import PerformanceChart from '@/components/observatory/PerformanceChart';
import SystemHealth from '@/components/observatory/SystemHealth';
import VisitorCounter from '@/components/observatory/VisitorCounter';
import PageTracker from '@/components/PageTracker';

export default function ObservatoryPage() {
  const [loading, setLoading] = useState(true);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [totalSources, setTotalSources] = useState(0);
  const [recentSources, setRecentSources] = useState<Source[]>([]);
  const [sourcesThisWeek, setSourcesThisWeek] = useState(0);
  const [topPerformingQueries, setTopPerformingQueries] = useState<SearchQuery[]>([]);
  const [explorationQueries, setExplorationQueries] = useState<SearchQuery[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [successfulRuns, setSuccessfulRuns] = useState(0);
  const [averageEventsPerRun, setAverageEventsPerRun] = useState(0);
  const [totalEventsAdded, setTotalEventsAdded] = useState(0);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // Fetch last run
      const { data: lastRunData } = await supabase
        .from('agent_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      setLastRun(lastRunData);

      // Fetch recent events (last 20 added)
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentEvents(eventsData || []);

      // Fetch total trusted sources
      const { count: sourcesCount } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('is_trusted', true);
      setTotalSources(sourcesCount || 0);

      // Fetch recent sources
      const { data: recentSourcesData } = await supabase
        .from('sources')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(7);
      setRecentSources(recentSourcesData || []);

      // Fetch sources from this week
      const weekAgo = subDays(new Date(), 7).toISOString();
      const { count: weekSourcesCount } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo);
      setSourcesThisWeek(weekSourcesCount || 0);

      // Fetch top performing agent-generated queries (those that found sources)
      const { data: topQueriesData } = await supabase
        .from('search_queries')
        .select('*')
        .eq('created_by', 'agent')
        .gt('sources_found', 0)
        .order('sources_found', { ascending: false })
        .limit(5);
      setTopPerformingQueries(topQueriesData || []);

      // Fetch exploration queue (new queries that haven't been run yet)
      const { data: explorationData } = await supabase
        .from('search_queries')
        .select('*')
        .eq('created_by', 'agent')
        .eq('times_run', 0)
        .order('created_at', { ascending: false })
        .limit(5);
      setExplorationQueries(explorationData || []);

      // Fetch daily stats for last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: runsData } = await supabase
        .from('agent_runs')
        .select('started_at, events_added, errors')
        .gte('started_at', thirtyDaysAgo)
        .order('started_at', { ascending: true });

      if (runsData) {
        // Group by date
        const dateMap = new Map<string, number>();
        runsData.forEach((run) => {
          const date = run.started_at.split('T')[0];
          dateMap.set(date, (dateMap.get(date) || 0) + (run.events_added || 0));
        });
        const dailyData: DailyStats[] = Array.from(dateMap.entries()).map(([date, events_added]) => ({
          date,
          events_added,
        }));
        setDailyStats(dailyData);
      }

      // Fetch system health stats
      const { count: totalRunsCount } = await supabase
        .from('agent_runs')
        .select('*', { count: 'exact', head: true });
      setTotalRuns(totalRunsCount || 0);

      const { count: successfulRunsCount } = await supabase
        .from('agent_runs')
        .select('*', { count: 'exact', head: true })
        .eq('errors', 0);
      setSuccessfulRuns(successfulRunsCount || 0);

      // Calculate average events per run and total events added
      const { data: allRunsData } = await supabase
        .from('agent_runs')
        .select('events_added');
      if (allRunsData && allRunsData.length > 0) {
        const total = allRunsData.reduce((sum, run) => sum + (run.events_added || 0), 0);
        setTotalEventsAdded(total);
        setAverageEventsPerRun(total / allRunsData.length);
      }
    } catch (error) {
      console.error('Error fetching observatory data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTracker page="/observatory" />
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Observatory
              </h1>
              <p className="mt-1 text-gray-600">
                Watch the AI agent discover and curate Austin AI events
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Calendar
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* How It Works - Full Width */}
        <div className="mb-8">
          <HowItWorks />
        </div>

        {/* Last Run Card - Full Width */}
        <div className="mb-8">
          <LastRunCard run={lastRun} loading={loading} />
        </div>

        {/* First Row - Performance Chart + System Health (same height) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 flex">
            <div className="flex-1 flex flex-col">
              <PerformanceChart data={dailyStats} loading={loading} />
            </div>
          </div>
          <div className="flex">
            <div className="flex-1 flex flex-col">
              <SystemHealth
                totalRuns={totalRuns}
                successfulRuns={successfulRuns}
                averageEventsPerRun={averageEventsPerRun}
                totalEventsAdded={totalEventsAdded}
                loading={loading}
              />
            </div>
          </div>
        </div>

        {/* Second Row - Activity Feed + Discovery Stats (same height) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 flex">
            <div className="flex-1 flex flex-col">
              <ActivityFeed events={recentEvents} loading={loading} />
            </div>
          </div>
          <div className="flex">
            <div className="flex-1 flex flex-col">
              <DiscoveryStats
                totalSources={totalSources}
                recentSources={recentSources}
                sourcesThisWeek={sourcesThisWeek}
                loading={loading}
              />
            </div>
          </div>
        </div>

        {/* Third Row - Top Performing Queries + Exploration Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <LearningActivity
            topPerformers={topPerformingQueries}
            explorationQueue={explorationQueries}
            loading={loading}
            section="top-performers"
          />
          <LearningActivity
            topPerformers={topPerformingQueries}
            explorationQueue={explorationQueries}
            loading={loading}
            section="exploration"
          />
        </div>

        {/* Visitor Counter */}
        <div className="mt-12">
          <VisitorCounter />
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-gray-600">
            This page provides transparency into the AI agent&apos;s decision-making process. The agent runs daily to discover and curate Austin AI events autonomously.
          </p>
        </div>
      </footer>
    </div>
  );
}
