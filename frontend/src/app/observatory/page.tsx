'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { AgentRun, Source, SearchQuery, DailyStats } from '@/types/observatory';
import { Event } from '@/types/event';

// Components
import HowItWorks from '@/components/observatory/HowItWorks';
import LastRunCard from '@/components/observatory/LastRunCard';
import ActivityFeed from '@/components/observatory/ActivityFeed';
import DiscoveryStats from '@/components/observatory/DiscoveryStats';
import LearningActivity from '@/components/observatory/LearningActivity';
import PerformanceChart from '@/components/observatory/PerformanceChart';
import SystemHealth from '@/components/observatory/SystemHealth';
import VisitorCounter from '@/components/observatory/VisitorCounter';
import SectionHeader from '@/components/observatory/SectionHeader';
import SourceHealth from '@/components/observatory/SourceHealth';
import DecisionLog from '@/components/observatory/DecisionLog';
import CostTracking from '@/components/observatory/CostTracking';
import ErrorLog from '@/components/observatory/ErrorLog';
import HumanStewardship from '@/components/observatory/HumanStewardship';
import PageTracker from '@/components/PageTracker';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ObservatoryPage() {
  const [loading, setLoading] = useState(true);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [totalSources, setTotalSources] = useState(0);
  const [allSources, setAllSources] = useState<Source[]>([]);
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

      // Fetch recent runs (for decision log, cost tracking, error log)
      const { data: recentRunsData } = await supabase
        .from('agent_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(30);
      setRecentRuns(recentRunsData || []);

      // Fetch recent events (last 20 added)
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentEvents(eventsData || []);

      // Fetch ALL sources with trust tier data
      const { data: allSourcesData } = await supabase
        .from('sources')
        .select('*')
        .order('created_at', { ascending: false });
      setAllSources(allSourcesData || []);

      // Fetch total trusted sources (legacy query)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageTracker page="/observatory" />
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
          {/* Controls - absolutely positioned on desktop */}
          <div className="hidden sm:flex flex-col items-end gap-2 absolute right-4 sm:right-6 lg:right-8 top-6">
            <ThemeToggle />
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Calendar
            </Link>
          </div>
          {/* Title and subtitle */}
          <div>
            <div className="flex items-center justify-between sm:block">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Observatory
              </h1>
              {/* Mobile only: toggle */}
              <div className="sm:hidden">
                <ThemeToggle />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 mt-1">
              <p className="text-gray-600 dark:text-gray-300">
                A window into the human-AI collaboration behind Austin AI Events
              </p>
              {/* Mobile only: Back to Calendar button */}
              <Link
                href="/"
                className="sm:hidden shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Calendar
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* How It Works - Full Width */}
        <div className="mb-12">
          <HowItWorks />
        </div>

        {/* ============================================ */}
        {/* SECTION 1: AGENT PERFORMANCE */}
        {/* ============================================ */}
        <section className="mb-12">
          <SectionHeader
            title="Agent Performance"
            subtitle="What the agent is doing autonomously"
            icon="🤖"
          />

          {/* Last Run Card - Full Width */}
          <div className="mb-6">
            <LastRunCard run={lastRun} loading={loading} />
          </div>

          {/* Performance Chart + System Health */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <PerformanceChart data={dailyStats} loading={loading} />
            </div>
            <div>
              <SystemHealth
                totalRuns={totalRuns}
                successfulRuns={successfulRuns}
                averageEventsPerRun={averageEventsPerRun}
                totalEventsAdded={totalEventsAdded}
                loading={loading}
              />
            </div>
          </div>

          {/* Activity Feed + Discovery Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <ActivityFeed events={recentEvents} loading={loading} />
            </div>
            <div>
              <DiscoveryStats
                totalSources={totalSources}
                recentSources={recentSources}
                sourcesThisWeek={sourcesThisWeek}
                loading={loading}
              />
            </div>
          </div>

          {/* Learning Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        </section>

        {/* ============================================ */}
        {/* SECTION 2: UNDER THE HOOD */}
        {/* ============================================ */}
        <section className="mb-12">
          <SectionHeader
            title="Under the Hood"
            subtitle="How the agent thinks, decides, and sometimes fails"
            icon="🔍"
          />

          {/* Source Health + Decision Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SourceHealth sources={allSources} loading={loading} />
            <DecisionLog recentRuns={recentRuns} loading={loading} />
          </div>

          {/* Cost Tracking + Error Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CostTracking recentRuns={recentRuns} loading={loading} />
            <ErrorLog recentRuns={recentRuns} loading={loading} />
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION 3: HUMAN STEWARDSHIP */}
        {/* ============================================ */}
        <section className="mb-12">
          <SectionHeader
            title="Human Stewardship"
            subtitle="How humans guide the agent's growth"
            icon="🤝"
          />

          <HumanStewardship />
        </section>

        {/* Visitor Counter */}
        <div className="mt-12">
          <VisitorCounter />
        </div>
      </main>

      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This observatory provides transparency into both the autonomous agent&apos;s operations and the human-AI collaboration that continuously improves it.
          </p>
        </div>
      </footer>
    </div>
  );
}
